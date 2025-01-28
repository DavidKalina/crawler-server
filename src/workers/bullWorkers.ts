import { Worker } from "bullmq";
import { WORKER_CONNECTION_CONFIG } from "../constants/workerConnectionConfig";
import { supabase } from "../lib/supabaseClient";
import { crawlQueue } from "../queues/crawlQueue";
import { ServiceFactory } from "../services/serviceFactory";
import { crawlPage } from "../utils/crawlPage";
import { UrlValidator } from "../utils/UrlValidator";

// Keep track of the current crawl job being processed
let currentCrawlId: string | null = null;
let currentCrawlPriority: number | null = null;

// Semaphore for concurrent URL processing
let activeUrlCount = 0;
const MAX_CONCURRENT_URLS = 10; // Adjust based on your needs

async function handleJobCompletion(crawlId: string, jobId: string, status: "failed" | "crawled") {
  const services = ServiceFactory.getServices();

  await services.redisService.removeActiveJob(crawlId, jobId);
  const activeJobCount = await services.redisService.getActiveJobCount(crawlId);

  if (activeJobCount === 0) {
    console.log(`Finalizing crawl ${crawlId} with status: ${status}`);
    await services.dbService.updateJobStatus(crawlId, status, {
      completed_at: new Date().toISOString(),
    });
    await Promise.all([
      services.redisService.cleanup(crawlId),
      // Cancel any delayed jobs from this crawl
      crawlQueue.clean(0, 0, "delayed"),
    ]);
    console.log(`Crawl ${crawlId} finalized and cleaned up`);
    // Reset current crawl ID when the job is complete
    currentCrawlId = null;
    currentCrawlPriority = null;
    activeUrlCount = 0;
  }

  await services.queueUpdateService.broadcastQueueUpdate();
}

const worker = new Worker(
  "crawl-jobs",
  async (job) => {
    const services = ServiceFactory.getServices();
    const crawlId = job.data.id;
    const jobId = job.id!;
    const url = job.data.url;
    const priority = job.data.priority || 1;

    try {
      // Check if this is a new crawl job
      if (currentCrawlId === null) {
        currentCrawlId = crawlId;
        currentCrawlPriority = priority;
        activeUrlCount = 0;
      } else if (currentCrawlId !== crawlId) {
        // If a higher priority job comes in, pause current crawl
        if (priority > (currentCrawlPriority || 0)) {
          console.log(
            `Higher priority job detected (${priority} > ${currentCrawlPriority}). Switching crawls.`
          );

          // Move all jobs from current crawl to delayed state
          const activeJobs = await crawlQueue.getJobs(["active", "waiting"]);
          const currentCrawlJobs = activeJobs.filter((j) => j.data.id === currentCrawlId);

          await Promise.all(currentCrawlJobs.map((j) => j.moveToDelayed(Date.now() + 5000)));

          currentCrawlId = crawlId;
          currentCrawlPriority = priority;
          activeUrlCount = 0;
        } else {
          // If we're processing a different crawl and new job isn't higher priority,
          // delay this job
          const delayMs = 5000;
          console.log(
            `Worker busy with crawl ${currentCrawlId}, delaying job ${jobId} for ${delayMs}ms`
          );
          await job.moveToDelayed(Date.now() + delayMs);
          return { delayed: true, message: "Worker busy with another crawl" };
        }
      }

      // Check if we can process more URLs
      if (activeUrlCount >= MAX_CONCURRENT_URLS) {
        const delayMs = 1000;
        console.log(`Reached max concurrent URLs (${MAX_CONCURRENT_URLS}), delaying job ${jobId}`);
        await job.moveToDelayed(Date.now() + delayMs);
        return { delayed: true, message: "Max concurrent URLs reached" };
      }

      // Increment active URL count
      activeUrlCount++;

      try {
        const activeJobCount = await services.redisService.getActiveJobCount(crawlId);
        if (activeJobCount === 0) {
          await services.dbService.updateJobStatus(crawlId, "running");
        }

        const normalizedUrl = UrlValidator.normalizeUrl(url);
        if (!normalizedUrl) {
          throw new Error("Invalid URL format");
        }

        const isProcessed = await services.redisService.isUrlProcessed(crawlId, normalizedUrl);
        if (isProcessed) {
          return { skipped: true, url: normalizedUrl };
        }

        await Promise.all([
          services.redisService.addProcessedUrl(crawlId, normalizedUrl),
          services.redisService.addActiveJob(crawlId, jobId),
        ]);

        console.log(`Crawling page: ${normalizedUrl} (Active URLs: ${activeUrlCount})`);
        const result = await crawlPage(job.data);

        const { data: upsertResult, error: upsertError } = await supabase.rpc(
          "upsert_crawled_page",
          {
            p_url: result.url,
            p_crawl_job_id: crawlId,
            p_title: result.title,
            p_content_text: result.content,
            p_extracted_content: result.extractedContent,
            p_depth: result.depth,
            p_processing_status: "completed",
          }
        );

        if (upsertError) throw upsertError;

        if (upsertResult?.[0]?.quota_exceeded) {
          await handleJobCompletion(crawlId, jobId, "failed");

          throw {
            name: "QuotaExceededError",
            message: `Monthly quota exceeded. ${upsertResult[0].pages_remaining} pages remaining`,
          };
        }

        if (upsertResult?.[0]?.inserted) {
          await services.dbService.incrementPagesCount(crawlId);

          if (result.depth < job.data.maxDepth) {
            const normalizedUrls = result.links
              .map((url) => UrlValidator.normalizeUrl(url))
              .filter(Boolean) as string[];

            const processedStatuses = await services.redisService.areUrlsProcessed(
              crawlId,
              normalizedUrls
            );
            const newUrls = normalizedUrls.filter((_, index) => !processedStatuses[index]);

            // Add new jobs with a slight delay between them to prevent overwhelming the queue
            await Promise.all(
              newUrls.map(async (newUrl, index) => {
                try {
                  const newJob = await crawlQueue.add(
                    "crawl-jobs",
                    {
                      id: crawlId,
                      url: newUrl,
                      maxDepth: job.data.maxDepth,
                      currentDepth: result.depth + 1,
                      parentUrl: result.url,
                      priority: priority,
                    },
                    {
                      priority,
                      delay: index * 100, // Small delay between jobs
                      removeOnComplete: true,
                      removeOnFail: true,
                    }
                  );
                  await services.redisService.addActiveJob(crawlId, newJob.id!);
                } catch (error) {
                  console.error(`Failed to add job for URL ${newUrl}:`, error);
                }
              })
            );
          }
        }

        return result;
      } finally {
        // Decrement active URL count, even if there was an error
        activeUrlCount = Math.max(0, activeUrlCount - 1);
      }
    } catch (error) {
      console.error(`Job ${jobId} failed:`, error);
      throw error;
    }
  },
  {
    ...WORKER_CONNECTION_CONFIG,
    concurrency: MAX_CONCURRENT_URLS, // Allow multiple concurrent job processing
    limiter: {
      max: 20, // Allow more requests per duration
      duration: 1000, // Per second
    },
  }
);

// Completion handler
worker.on("completed", async (job) => {
  const crawlId = job.data.id;
  const jobId = job.id!;
  await handleJobCompletion(crawlId, jobId, "crawled");
});

// Failure handler
worker.on("failed", async (job, error) => {
  if (job) {
    const services = ServiceFactory.getServices();
    const crawlId = job.data.id;
    const jobId = job.id!;

    if (error?.name !== "QuotaExceededError") {
      console.log(`Handling failure for job ${jobId}:`, error);
      await services.dbService.incrementErrorsCount(crawlId);
    }

    await handleJobCompletion(crawlId, jobId, "failed");
  }
  await ServiceFactory.getServices().queueUpdateService.broadcastQueueUpdate();
});

worker.on("error", (error) => {
  console.error("Worker error:", error);
});

worker.on("ready", () => {
  console.log("Worker is ready and connected to Redis!");
});

export default worker;
