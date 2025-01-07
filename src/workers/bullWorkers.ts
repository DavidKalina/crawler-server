import { Worker } from "bullmq";
import { WORKER_CONNECTION_CONFIG } from "../constants/workerConnectionConfig";
import dotenv from "dotenv";
import { supabase } from "../lib/supabaseClient";
import { crawlQueue } from "../queues/crawlQueue";
import { crawlPage, cleanupCrawlJob } from "../utils/crawlPage";
import { UrlValidator } from "../utils/UrlValidator";

dotenv.config(); // Add this at the top of bullWorkers.ts

// Keep track of active jobs per crawl
const activeJobsTracker = new Map<string, Set<string>>();

// Create a worker to process crawl jobs
const worker = new Worker(
  "crawl-jobs",
  async (job) => {
    const crawlId = job.data.id;
    const jobId = job.id!;

    try {
      // Initialize tracking for this crawl if not exists
      if (!activeJobsTracker.has(crawlId)) {
        activeJobsTracker.set(crawlId, new Set([jobId]));
        await supabase
          .from("web_crawl_jobs")
          .update({ status: "running", last_processed_url: job.data.url })
          .eq("id", crawlId);
      } else {
        activeJobsTracker.get(crawlId)?.add(jobId);
      }

      // First check if this URL was already processed
      const normalizedUrl = UrlValidator.normalizeUrl(job.data.url);
      if (!normalizedUrl) {
        throw new Error("Invalid URL format");
      }

      // Attempt to crawl the page
      const result = await crawlPage(job.data);

      // Try to insert the page using our new upsert function
      const { data: upsertResult, error: upsertError } = await supabase.rpc("upsert_crawled_page", {
        p_url: result.url,
        p_crawl_job_id: crawlId,
        p_title: result.title,
        p_content_text: result.content,
        p_extracted_content: result.extractedContent,
        p_depth: result.depth,
        p_processing_status: "completed",
      });

      if (upsertError) throw upsertError;

      // Only process links if this was a new page (not a duplicate)
      if (upsertResult?.[0]?.inserted) {
        // Add new links to the queue if within depth limit
        if (result.depth < job.data.maxDepth) {
          const newJobs = result.links.map((url) => ({
            id: crawlId,
            url,
            maxDepth: job.data.maxDepth,
            currentDepth: result.depth + 1,
            parentUrl: result.url,
          }));

          // Add all new URLs to the queue and track their IDs
          await Promise.all(
            newJobs.map(async (jobData) => {
              const newJob = await crawlQueue.add("crawl-jobs", jobData, {
                removeOnComplete: true,
                removeOnFail: false,
              });
              activeJobsTracker.get(crawlId)?.add(newJob.id!);
            })
          );
        }

        // Update metrics only for new pages
        await supabase.rpc("aggregate_metrics", {
          p_job_id: crawlId,
          p_period: "5m",
          p_start: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
          p_end: new Date().toISOString(),
        });

        // Log successful crawl
        await supabase.from("crawler_logs").insert({
          crawl_job_id: crawlId,
          level: "info",
          message: `Successfully crawled ${result.url}`,
          metadata: {
            depth: result.depth,
            newLinks: result.links.length,
          },
        });
      } else {
        // Log skipped duplicate
        await supabase.from("crawler_logs").insert({
          crawl_job_id: crawlId,
          level: "info",
          message: `Skipped duplicate URL: ${result.url}`,
          metadata: {
            depth: result.depth,
            pageId: upsertResult?.[0]?.page_id,
          },
        });
      }

      return result;
    } catch (error) {
      // Log crawl error
      await supabase.from("crawler_logs").insert({
        crawl_job_id: crawlId,
        level: "error",
        message: `Failed to crawl: ${error}`,
        metadata: {
          url: job.data.url,
          depth: job.data.currentDepth,
        },
      });

      throw error;
    }
  },
  WORKER_CONNECTION_CONFIG
);

// bullWorkers.ts - Update the completion handler
worker.on("completed", async (job) => {
  const crawlId = job.data.id;
  const jobId = job.id!;
  const activeJobs = activeJobsTracker.get(crawlId);

  if (activeJobs) {
    // Remove this job from tracking
    activeJobs.delete(jobId);

    // Update total pages crawled
    await supabase.rpc("jsonb_deep_merge", {
      current: {},
      new: {
        total_pages_crawled: job.data.currentDepth + 1,
      },
    });

    // If no more active jobs for this crawl, mark as completed and clean up
    if (activeJobs.size === 0) {
      await supabase
        .from("web_crawl_jobs")
        .update({
          status: "crawled",
          completed_at: new Date().toISOString(),
        })
        .eq("id", crawlId);

      // Clean up trackers
      activeJobsTracker.delete(crawlId);
      cleanupCrawlJob(crawlId); // Add this line
    }
  }
});

worker.on("failed", async (job, error) => {
  if (job) {
    const crawlId = job.data.id;
    const jobId = job.id!;
    const activeJobs = activeJobsTracker.get(crawlId);

    if (activeJobs) {
      // Remove this job from tracking
      activeJobs.delete(jobId);

      // If no more active jobs, mark crawl as failed
      if (activeJobs.size === 0) {
        await supabase
          .from("web_crawl_jobs")
          .update({
            status: "failed",
            processing_stats: {
              last_error: error.message,
              failed_at: new Date().toISOString(),
            },
          })
          .eq("id", crawlId);

        // Clean up tracker
        activeJobsTracker.delete(crawlId);
        cleanupCrawlJob(crawlId); // Add this line
      }
    }
  }
});

worker.on("error", (error) => {
  console.error("Worker error:", error);
});

worker.on("active", (job) => {
  console.log("Job asd:", job.id, "for crawl:", job.data.id);
});
// Handle job failures

// Add these logs
worker.on("ready", () => {
  console.log("Worker is ready and connected to Redis!");
});

export default worker;
