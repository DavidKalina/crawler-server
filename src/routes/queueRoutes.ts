import { Router } from "express";
import { ServiceFactory } from "../services/serviceFactory";
import { QueueJobInfo } from "../types/queueTypes";

const router = Router();

// POST /api/queue/stop/:crawlId - Stop a specific crawl job
// POST /api/queue/stop/:crawlId - Stop a specific crawl job
router.post("/stop/:crawlId", async (req, res) => {
  const { queueService, dbService, redisService } = ServiceFactory.getServices();

  try {
    const { crawlId } = req.params;
    console.log(`[Stop Endpoint] Attempting to stop crawl: ${crawlId}`);

    let jobs: QueueJobInfo[] = [];
    try {
      jobs = await queueService.getJobsByCrawlId(crawlId);
      console.log(`[Stop Endpoint] Found ${jobs.length} jobs to process`);
    } catch (error) {
      console.error("[Stop Endpoint] Error fetching jobs:", error);
      throw error;
    }

    const activeJobs = jobs.filter((job) => job.state === "active" || job.state === "waiting");

    console.log(`[Stop Endpoint] Found ${activeJobs.length} active/waiting jobs to stop`);

    // Remove jobs with error handling for each job
    const removalResults = await Promise.allSettled(
      activeJobs.map(async (job) => {
        try {
          await queueService.removeJob(job.id);
          await redisService.removeActiveJob(crawlId, job.id);
          return { jobId: job.id, success: true };
        } catch (error) {
          console.error(`[Stop Endpoint] Failed to remove job ${job.id}:`, error);
          return { jobId: job.id, success: false, error };
        }
      })
    );

    // Count successful removals
    const successfulRemovals = removalResults.filter(
      (result) => result.status === "fulfilled" && result.value.success
    ).length;

    console.log(
      `[Stop Endpoint] Successfully removed ${successfulRemovals} out of ${activeJobs.length} jobs`
    );

    // Update job status and clean up
    await dbService.updateJobStatus(crawlId, "stopping", {
      completed_at: new Date().toISOString(),
    });

    await redisService.cleanup(crawlId);
    await ServiceFactory.getServices().queueUpdateService.broadcastQueueUpdate();

    await dbService.updateJobStatus(crawlId, "crawled", {
      completed_at: new Date().toISOString(),
    });

    res.json({
      success: true,
      summary: {
        crawl_id: crawlId,
        total_jobs: activeJobs.length,
        jobs_stopped: successfulRemovals,
        status: "stopped",
      },
    });
  } catch (error) {
    console.error(`[Stop Endpoint] Failed to stop crawl ${req.params.crawlId}:`, error);
    res.status(500).json({
      success: false,
      error: "Failed to stop crawl",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});
// POST /api/queue/clear - Clear all jobs from the queue
router.post("/clear", async (_, res) => {
  const { queueService, dbService, redisService } = ServiceFactory.getServices();

  try {
    // Get jobs before clearing them
    const jobs = await queueService.getRecentJobs(999999999);

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

      // Clean up any tracking data
      redisService.cleanup(crawlId);
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
  const { queueService, dbService, redisService } = ServiceFactory.getServices();

  try {
    const jobs = await queueService.getRecentJobs(999999999);

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

        results.crawlsAffected++;
        results.totalJobsRemoved += jobs.length;

        redisService.cleanup(crawlId);
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
// routes/queueRoutes.ts

router.get("/status/:jobId", async (req, res) => {
  const { queueService } = ServiceFactory.getServices();

  try {
    const { jobId } = req.params;

    // Get jobs and queue stats for this crawl job
    const jobs = await queueService.getJobsByCrawlId(jobId);

    // Calculate queue stats from the jobs
    const queueStats = {
      waitingCount: jobs.filter((job) => job.state === "waiting").length,
      activeCount: jobs.filter((job) => job.state === "active").length,
      completedCount: jobs.filter((job) => job.state === "completed").length,
      failedCount: jobs.filter((job) => job.state === "failed").length,
    };

    res.json({
      jobs: jobs.map((job) => ({
        id: job.id,
        state: job.state,
        data: {
          url: job.data.url,
          currentDepth: job.data.currentDepth,
          maxDepth: job.data.maxDepth,
        },
      })),
      queueStats,
      totalJobs: jobs.length,
      crawlJobId: jobId,
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
