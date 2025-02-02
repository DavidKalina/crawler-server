import { Router } from "express";
import { serviceFactory } from "../services/serviceFactory";
import { QueueJobInfo } from "../types/queueTypes";
import { crawlQueue } from "../queues/crawlQueue";

const router = Router();

// POST /api/queue/stop/:crawlId - Stop a specific crawl job
// POST /api/queue/stop/:crawlId - Stop a specific crawl job

// POST /api/queue/clear - Clear all jobs from the queue
router.post("/clear", async (_, res) => {
  const { queueService, dbService, redisService } = serviceFactory.getServices();

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
  const { queueService, dbService, redisService } = serviceFactory.getServices();

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
    await serviceFactory.cleanup();

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
  const { queueService } = serviceFactory.getServices();

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

// GET /api/queue/jobs - Get all jobs and their status
router.get("/jobs", async (req, res) => {
  const { queueService } = serviceFactory.getServices();

  try {
    // Get all jobs
    const jobs = await crawlQueue.getJobs([
      "active",
      "completed",
      "failed",
      "delayed",
      "paused",
      "prioritized",
      "wait",
      "waiting",
      "waiting-children",
    ]);

    // Filter by state if specified
    const state = req.query.state as string;
    const filteredJobs = state ? jobs.filter((job) => job.state === state) : jobs;

    // Calculate queue statistics
    const queueStats = {
      totalJobs: filteredJobs.length,
      waitingCount: filteredJobs.filter((job) => job.state === "waiting").length,
      activeCount: filteredJobs.filter((job) => job.state === "active").length,
      completedCount: filteredJobs.filter((job) => job.state === "completed").length,
      failedCount: filteredJobs.filter((job) => job.state === "failed").length,
    };

    // Group jobs by crawl ID
    const jobsByCrawlId = filteredJobs.reduce((acc, job) => {
      const crawlId = job.data.id;
      if (!acc[crawlId]) {
        acc[crawlId] = [];
      }
      acc[crawlId].push({
        id: job.id,
        state: job.state,
        data: {
          url: job.data.url,
          currentDepth: job.data.currentDepth,
          maxDepth: job.data.maxDepth,
          crawlId: job.data.id,
          createdAt: new Date(),
        },
      });
      return acc;
    }, {} as Record<string, any[]>);

    res.json({
      success: true,
      queueStats,
      jobs: jobsByCrawlId,
    });
  } catch (error) {
    console.error("Failed to fetch jobs:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch jobs",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

export const queueRouter = router;
