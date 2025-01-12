import { Worker } from "bullmq";
import { WORKER_CONNECTION_CONFIG } from "../constants/workerConnectionConfig";
import { supabase } from "../lib/supabaseClient";
import { crawlQueue } from "../queues/crawlQueue";
import { crawlPage, cleanupCrawlJob } from "../utils/crawlPage";
import { UrlValidator } from "../utils/UrlValidator";
import { broadcastQueueUpdate } from "..";

// Keep track of active jobs and processed URLs per crawl
const activeJobsTracker = new Map<string, Set<string>>();
const processedUrlsTracker = new Map<string, Set<string>>();

const worker = new Worker(
  "crawl-jobs",
  async (job) => {
    const crawlId = job.data.id;
    const jobId = job.id!;
    const url = job.data.url;

    console.log(`Starting job ${jobId} for URL: ${url}`);

    try {
      // Initialize tracking for this crawl if not exists
      if (!activeJobsTracker.has(crawlId)) {
        console.log(`Initializing new crawl tracking for ${crawlId}`);
        activeJobsTracker.set(crawlId, new Set([jobId]));
        processedUrlsTracker.set(crawlId, new Set());
        await supabase.from("web_crawl_jobs").update({ status: "running" }).eq("id", crawlId);
      } else {
        activeJobsTracker.get(crawlId)?.add(jobId);
      }

      // Normalize URL and check if already processed
      const normalizedUrl = UrlValidator.normalizeUrl(url);
      if (!normalizedUrl) {
        console.log(`Invalid URL format: ${url}`);
        throw new Error("Invalid URL format");
      }

      const processedUrls = processedUrlsTracker.get(crawlId)!;
      if (processedUrls.has(normalizedUrl)) {
        console.log(`Skipping already processed URL: ${normalizedUrl}`);
        return { skipped: true, url: normalizedUrl };
      }

      console.log(`Processing URL: ${normalizedUrl}`);
      processedUrls.add(normalizedUrl);

      // Attempt to crawl the page
      console.log(`Crawling page: ${normalizedUrl}`);
      const result = await crawlPage(job.data);
      console.log(`Crawl completed for: ${normalizedUrl}, found ${result.links.length} links`);

      // Try to insert the page
      const { data: upsertResult, error: upsertError } = await supabase.rpc("upsert_crawled_page", {
        p_url: result.url,
        p_crawl_job_id: crawlId,
        p_title: result.title,
        p_content_text: result.content,
        p_extracted_content: result.extractedContent,
        p_depth: result.depth,
        p_processing_status: "completed",
      });

      if (upsertError) {
        console.error(`Upsert error for ${normalizedUrl}:`, upsertError);
        throw upsertError;
      }

      // Only increment counter and process links if this was a new page
      if (upsertResult?.[0]?.inserted) {
        console.log(`New page inserted: ${normalizedUrl}`);

        // Increment total pages crawled exactly once
        // Update this in your worker code
        await supabase.rpc("increment_pages_crawled", {
          job_id: crawlId,
          increment_by: 1,
        });

        // Add new links to the queue if within depth limit
        if (result.depth < job.data.maxDepth) {
          console.log(`Processing ${result.links.length} links from ${normalizedUrl}`);

          // Filter and normalize URLs synchronously
          const newUrls = result.links
            .map((url) => UrlValidator.normalizeUrl(url))
            .filter(Boolean)
            .filter((url) => !processedUrls.has(url!));

          console.log(`Found ${newUrls.length} new unique URLs to process`);

          // Add filtered URLs to the queue
          for (const newUrl of newUrls) {
            try {
              const newJob = await crawlQueue.add(
                "crawl-jobs",
                {
                  id: crawlId,
                  url: newUrl,
                  maxDepth: job.data.maxDepth,
                  currentDepth: result.depth + 1,
                  parentUrl: result.url,
                },
                {
                  removeOnComplete: false,
                  removeOnFail: false,
                }
              );
              activeJobsTracker.get(crawlId)?.add(newJob.id!);
              console.log(`Added new job ${newJob.id} for URL: ${newUrl}`);
            } catch (error) {
              console.error(`Failed to add job for URL ${newUrl}:`, error);
            }
          }
        }

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
        console.log(`Duplicate page skipped: ${normalizedUrl}`);
      }

      console.log(`Job ${jobId} completed successfully`);
      return result;
    } catch (error) {
      console.error(`Job ${jobId} failed:`, error);

      // Log crawl error
      await supabase.from("crawler_logs").insert({
        crawl_job_id: crawlId,
        level: "error",
        message: `Failed to crawl: ${error}`,
        metadata: {
          url: url,
          depth: job.data.currentDepth,
        },
      });

      throw error;
    }
  },
  WORKER_CONNECTION_CONFIG
);

// Completion handler
worker.on("completed", async (job) => {
  const crawlId = job.data.id;
  const jobId = job.id!;

  console.log(`Handling completion for job ${jobId}`);

  const activeJobs = activeJobsTracker.get(crawlId);
  if (activeJobs) {
    activeJobs.delete(jobId);
    console.log(`Remaining active jobs for crawl ${crawlId}: ${activeJobs.size}`);

    if (activeJobs.size === 0) {
      console.log(`Completing crawl ${crawlId}`);

      const { error } = await supabase
        .from("web_crawl_jobs")
        .update({
          status: "crawled",
          completed_at: new Date(),
        })
        .eq("id", crawlId);

      if (error) {
        console.error(`ERROR_UPDATING_CRAWL_JOB`, error);
      }

      activeJobsTracker.delete(crawlId);
      processedUrlsTracker.delete(crawlId);
      cleanupCrawlJob(crawlId);

      console.log(`Crawl ${crawlId} completed and cleaned up`);
    }
  }
  await broadcastQueueUpdate();
});

worker.on("failed", async (job, error) => {
  if (job) {
    const crawlId = job.data.id;
    const jobId = job.id!;
    console.log(`Handling failure for job ${jobId}:`, error);

    await supabase.rpc("update_job_metadata", {
      job_id: crawlId,
      updates: {
        error_count: 1, // This will increment by 1 due to JSONB concatenation
      },
    });

    const activeJobs = activeJobsTracker.get(crawlId);
    if (activeJobs) {
      activeJobs.delete(jobId);

      if (activeJobs.size === 0) {
        console.log(`Marking crawl ${crawlId} as failed`);

        await supabase.rpc("update_job_metadata", {
          job_id: crawlId,
          updates: {
            last_error: error.message,
            failed_at: new Date().toISOString(),
          },
        });

        await supabase.from("web_crawl_jobs").update({ status: "failed" }).eq("id", crawlId);
        activeJobsTracker.delete(crawlId);
        processedUrlsTracker.delete(crawlId);
        cleanupCrawlJob(crawlId);

        console.log(`Crawl ${crawlId} marked as failed and cleaned up`);
      }
    }
  }
  await broadcastQueueUpdate();
});

worker.on("error", (error) => {
  console.error("Worker error:", error);
});

worker.on("ready", () => {
  console.log("Worker is ready and connected to Redis!");
});

export default worker;
