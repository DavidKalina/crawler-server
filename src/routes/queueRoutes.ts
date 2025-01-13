import { Router } from "express";
import { cleanupCrawlJob } from "../utils/crawlPage";
import { ServiceFactory } from "../services/serviceFactory";
import { QueueJobInfo } from "../types/queueTypes";

const router = Router();

// POST /api/queue/clear - Clear all jobs from the queue
router.post("/clear", async (_, res) => {
  const { queueService, dbService } = ServiceFactory.getServices();

  try {
    // Get jobs before clearing them
    const jobs = await queueService.getRecentJobs(Infinity);

    // Group jobs by crawl ID
    const jobsByCrawlId = jobs.reduce((acc, job) => {
      const crawlId = job.data.id;
      if (!acc.has(crawlId)) {
        acc.set(crawlId, []);
      }
      acc.get(crawlId)?.push(job.id);
      return acc;
    }, new Map<string, string[]>());

    // Clear all jobs and get the count of cleared jobs
    const clearedJobCount = await queueService.clearJobs();

    // Process each crawl's jobs
    for (const [crawlId, jobIds] of jobsByCrawlId) {
      // Update database and log the operation
      await dbService.updateJobAfterQueueClear(crawlId, jobIds.length);
      await dbService.logQueueOperation({
        crawl_job_id: crawlId,
        operation: "queue_clear",
        jobIds,
        jobCount: jobIds.length,
      });

      // Clean up any tracking data
      cleanupCrawlJob(crawlId);
    }

    res.json({
      success: true,
      summary: {
        total_crawls_affected: jobsByCrawlId.size,
        total_jobs_cleared: clearedJobCount,
        affected_crawl_ids: Array.from(jobsByCrawlId.keys()),
      },
    });
  } catch (error) {
    console.error("Failed to clear queue:", error);
    res.status(500).json({
      success: false,
      error: "Failed to clear queue",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// POST /api/queue/reset - Reset the queue
router.post("/reset", async (_, res) => {
  const { queueService, dbService } = ServiceFactory.getServices();

  try {
    const jobs = await queueService.getRecentJobs(Infinity);

    const jobsByCrawlId = jobs.reduce((acc, job) => {
      const crawlId = job.data.id;
      if (!acc.has(crawlId)) {
        acc.set(crawlId, []);
      }
      acc.get(crawlId)?.push(job);
      return acc;
    }, new Map<string, QueueJobInfo[]>());

    const results = {
      crawlsAffected: 0,
      totalJobsRemoved: 0,
      jobsByState: {} as Record<string, number>,
      errors: [] as string[],
    };

    // Process each crawl's jobs
    for (const [crawlId, jobs] of jobsByCrawlId) {
      try {
        // Count jobs by state
        jobs.forEach((job) => {
          results.jobsByState[job.state] = (results.jobsByState[job.state] || 0) + 1;
        });

        // Remove all jobs for this crawl
        await Promise.all(jobs.map((job) => queueService.removeJob(job.id)));

        // Update database and log the operation
        await dbService.updateJobAfterQueueReset(crawlId, jobs.length);
        await dbService.logQueueOperation({
          crawl_job_id: crawlId,
          operation: "queue_reset",
          jobIds: jobs.map((j) => j.id),
          jobCount: jobs.length,
        });

        results.crawlsAffected++;
        results.totalJobsRemoved += jobs.length;

        cleanupCrawlJob(crawlId);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        results.errors.push(`Failed to process crawl ${crawlId}: ${errorMessage}`);
      }
    }
    await ServiceFactory.cleanup();

    res.json({
      success: true,
      summary: {
        crawls_affected: results.crawlsAffected,
        total_jobs_removed: results.totalJobsRemoved,
        jobs_by_state: results.jobsByState,
        errors: results.errors,
      },
    });
  } catch (error) {
    console.error("Failed to reset queue:", error);
    res.status(500).json({
      success: false,
      error: "Failed to reset queue",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// GET /api/queue/status/:jobId - Get queue status for a specific job
router.get("/status/:jobId", async (req, res) => {
  const { queueService } = ServiceFactory.getServices();

  try {
    const { jobId } = req.params;

    let jobs;
    if (jobId) {
      jobs = await queueService.getJobsByCrawlId(jobId);
    } else {
      jobs = await queueService.getRecentJobs(Infinity);
    }

    const queueStats = {
      waitingCount: jobs.filter((job) => job.state === "waiting").length,
      activeCount: jobs.filter((job) => job.state === "active").length,
      completedCount: jobs.filter((job) => job.state === "completed").length,
      failedCount: jobs.filter((job) => job.state === "failed").length,
    };

    const totalJobs = Object.values(queueStats).reduce((sum, count) => sum + count, 0);

    res.json({
      jobs,
      queueStats,
      totalJobs,
      crawlJobId: jobId || null,
    });
  } catch (error) {
    console.error("Failed to fetch queue status:", error);
    res.status(500).json({
      error: "Failed to fetch queue status",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

export const queueRouter = router;
