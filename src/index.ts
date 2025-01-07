import { createClient } from "@supabase/supabase-js";
import { JobType } from "bullmq";
import dotenv from "dotenv";
import express from "express";
import { v4 as uuidv4 } from "uuid";
import { crawlQueue } from "./queues/crawlQueue";
import { ExtractedContent } from "./types/contentTypes";
import { domainGuard } from "./utils/DomainGuard";
import { UrlValidator } from "./utils/UrlValidator";
import "./workers/bullWorkers";
import { cleanupCrawlJob } from "./utils/crawlPage";
import { checkQueueHealth, HealthStatus } from "./utils/checkHealth";
console.log("Worker started and listening for jobs...");

dotenv.config();

// Types
export interface CrawlJob {
  id: string;
  url: string;
  maxDepth: number;
  currentDepth: number;
  parentUrl?: string;
}
export interface QueueJobInfo {
  id: string;
  state: string;
  data: any;
  progress: number | object;
}

export interface CrawlDebugInfo {
  url: string;
  timestamp: string;
  responseStatus?: number;
  responseSize?: number;
  cheerioLoadSuccess?: boolean;
  extractionSuccess?: boolean;
  error?: string;
  contentStats?: {
    rawTextLength?: number;
    headingsCount?: number;
    paragraphsCount?: number;
    listsCount?: number;
    tablesCount?: number;
    linksCount?: number;
  };
}

interface EnhancedJobStatus {
  databaseJob: any;
  queueInfo: {
    mainJob: QueueJobInfo | null;
    childJobs: QueueJobInfo[];
    waitingCount: number;
    activeCount: number;
    completedCount: number;
    failedCount: number;
  };
}

export interface CrawlResult {
  url: string;
  title: string | null;
  content: string | null;
  extractedContent: ExtractedContent;
  links: string[];
  depth: number;
}

// Initialize Express app
export const app = express();
app.use(express.json());

// Initialize Supabase client
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_KEY!);

// Add cleanup function

// API Endpoints
app.post("/api/crawl", async (req, res) => {
  const { startUrl, maxDepth = 3, allowedDomains } = req.body;

  if (!startUrl || !UrlValidator.isValidUrl(startUrl)) {
    res.status(400).json({ error: "Invalid start URL" });
  }

  try {
    // Configure domain guard for this crawl
    if (allowedDomains) {
      // If specific domains are provided, use those
      domainGuard.configure({
        allowedDomains,
        allowSubdomains: true,
      });
    } else {
      // Otherwise, just allow the domain of the start URL
      domainGuard.configureForUrl(startUrl);
    }

    // Create a new crawl job in the database
    const jobId = uuidv4();
    const { error: jobError } = await supabase.from("web_crawl_jobs").insert({
      id: jobId,
      start_url: startUrl,
      max_depth: maxDepth,
      status: "pending",
      total_pages_crawled: 0,
      config: {
        allowedDomains: allowedDomains || [new URL(startUrl).hostname],
      },
    });

    if (jobError) throw jobError;

    // Add initial URL to the queue
    await crawlQueue.add("crawl-jobs", {
      id: jobId,
      url: startUrl,
      maxDepth,
      currentDepth: 0,
    });

    res.json({
      message: "Crawl job started",
      jobId,
    });
  } catch (error) {
    console.error("Failed to start crawl job:", error);
    res.status(500).json({ error: "Failed to start crawl job" });
  }
});

app.get("/api/crawl/:jobId", async (req, res) => {
  const { jobId } = req.params;

  try {
    // 1. Get database job status
    const { data: databaseJob, error } = await supabase
      .from("web_crawl_jobs")
      .select("*")
      .eq("id", jobId)
      .single();

    if (error) throw error;

    // 2. Get queue information
    const queueInfo = {
      mainJob: null as QueueJobInfo | null,
      childJobs: [] as QueueJobInfo[],
      waitingCount: 0,
      activeCount: 0,
      completedCount: 0,
      failedCount: 0,
    };

    // Get job counts
    queueInfo.waitingCount = await crawlQueue.getWaitingCount();
    queueInfo.activeCount = await crawlQueue.getActiveCount();
    queueInfo.completedCount = await crawlQueue.getCompletedCount();
    queueInfo.failedCount = await crawlQueue.getFailedCount();

    // Get main job from queue
    const mainJob = await crawlQueue.getJob(jobId);
    if (mainJob) {
      console.log(mainJob);
    }

    // Get child jobs (using job.data.id since that contains the crawl job ID)
    const allJobs = await crawlQueue.getJobs(["waiting", "active", "completed", "failed"]);
    queueInfo.childJobs = await Promise.all(
      allJobs.filter((job) => job.data.id === jobId && job.id !== jobId) // Get child jobs only
    );

    const response: EnhancedJobStatus = {
      databaseJob,
      queueInfo,
    };

    res.json(response);
  } catch (error) {
    console.error("Failed to fetch enhanced job status:", error);
    res.status(500).json({
      error: "Failed to fetch job status",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

app.post("/api/queue/clear", async (_, res) => {
  try {
    // Get all job states we want to clear
    const jobStates: JobType[] = ["waiting", "active", "delayed", "failed"];
    const jobs = await crawlQueue.getJobs(jobStates);

    // Group jobs by crawl ID for organized cleanup
    const jobsByCrawlId = new Map<string, string[]>();

    jobs.forEach((job) => {
      const crawlId = job.data.id;
      if (!jobsByCrawlId.has(crawlId)) {
        jobsByCrawlId.set(crawlId, []);
      }
      jobsByCrawlId.get(crawlId)?.push(job.id!);
    });

    // Process each crawl's jobs
    for (const [crawlId, jobIds] of jobsByCrawlId) {
      // Remove jobs from queue
      await Promise.all(jobIds.map((id) => crawlQueue.remove(id)));

      // Update crawl job status in database
      await supabase
        .from("web_crawl_jobs")
        .update({
          status: "stopped",
          stop_requested_at: new Date().toISOString(),
          processing_stats: {
            cleared_at: new Date().toISOString(),
            cleared_job_count: jobIds.length,
          },
        })
        .eq("id", crawlId);

      // Log the clear operation
      await supabase.from("crawler_logs").insert({
        crawl_job_id: crawlId,
        level: "info",
        message: `Cleared ${jobIds.length} pending jobs`,
        metadata: {
          cleared_job_ids: jobIds,
          operation: "queue_clear",
        },
      });

      // Clean up any tracking data
      cleanupCrawlJob(crawlId);
    }

    // Return summary of cleared jobs
    res.json({
      success: true,
      summary: {
        total_crawls_affected: jobsByCrawlId.size,
        total_jobs_cleared: jobs.length,
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

app.get("/api/health", async (_, res) => {
  const startTime = process.uptime();
  let status: HealthStatus = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    services: {
      api: {
        status: "healthy",
        uptime: startTime,
      },
      redis: {
        status: "healthy",
      },
      supabase: {
        status: "healthy",
      },
      queue: await checkQueueHealth(crawlQueue),
    },
  };

  // Check Redis connection through BullMQ
  try {
    await (await crawlQueue.client).ping();
  } catch (error) {
    status.services.redis = {
      status: "unhealthy",
      message: error instanceof Error ? error.message : "Redis connection failed",
    };
    status.status = "unhealthy";
  }

  // Check Supabase connection
  try {
    const { error } = await supabase.from("web_crawl_jobs").select("id").limit(1);
    if (error) throw error;
  } catch (error) {
    status.services.supabase = {
      status: "unhealthy",
      message: error instanceof Error ? error.message : "Supabase connection failed",
    };
    status.status = "unhealthy";
  }

  // If queue is degraded but everything else is healthy, mark overall as degraded
  if (status.status === "healthy" && status.services.queue.status === "degraded") {
    status.status = "degraded";
  }

  const statusCode = status.status === "unhealthy" ? 503 : 200;
  res.status(statusCode).json(status);
});

// Add this endpoint to your Express app routes in index.ts

app.post("/api/queue/reset", async (_, res) => {
  try {
    // Get all jobs in all possible states
    const jobStates = [
      "waiting",
      "active",
      "delayed",
      "paused",
      "failed",
      "completed",
    ] as JobType[];
    const jobs = await crawlQueue.getJobs(jobStates);

    // Group jobs by crawl ID for organized cleanup
    const jobsByCrawlId = new Map<string, string[]>();

    jobs.forEach((job) => {
      const crawlId = job.data.id;
      if (!jobsByCrawlId.has(crawlId)) {
        jobsByCrawlId.set(crawlId, []);
      }
      jobsByCrawlId.get(crawlId)?.push(job.id!);
    });

    // Process each crawl's jobs
    const results = {
      crawlsAffected: 0,
      totalJobsRemoved: 0,
      jobsByState: {} as Record<string, number>,
      errors: [] as string[],
    };

    for (const [crawlId, jobIds] of jobsByCrawlId) {
      try {
        // Remove jobs from queue
        await Promise.all(
          jobIds.map(async (id) => {
            const job = await crawlQueue.getJob(id);
            if (job) {
              const state = await job.getState();
              results.jobsByState[state] = (results.jobsByState[state] || 0) + 1;
              await job.remove();
            }
            return id;
          })
        );

        // Update crawl job status in database
        const { error: updateError } = await supabase
          .from("web_crawl_jobs")
          .update({
            status: "stopped",
            stop_requested_at: new Date().toISOString(),
            processing_stats: {
              reset_at: new Date().toISOString(),
              cleared_job_count: jobIds.length,
            },
          })
          .eq("id", crawlId);

        if (updateError) throw updateError;

        // Log the reset operation
        await supabase.from("crawler_logs").insert({
          crawl_job_id: crawlId,
          level: "info",
          message: `Queue reset - cleared ${jobIds.length} jobs`,
          metadata: {
            cleared_job_ids: jobIds,
            operation: "queue_reset",
          },
        });

        results.crawlsAffected++;
        results.totalJobsRemoved += jobIds.length;

        // Clean up any tracking data
        cleanupCrawlJob(crawlId);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        results.errors.push(`Failed to process crawl ${crawlId}: ${errorMessage}`);
      }
    }

    // Obliterate any remaining jobs (safety net)
    await crawlQueue.obliterate({ force: true });

    // Return summary of the operation
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

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default app;
