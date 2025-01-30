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
const MAX_CONCURRENT_URLS = 10;

// Track stopping state for each crawl
const stoppingCrawls = new Set<string>();

async function handleJobCompletion(crawlId: string, jobId: string, status: "failed" | "crawled") {
  const services = ServiceFactory.getServices();

  await services.redisService.removeActiveJob(crawlId, jobId);
  const activeJobCount = await services.redisService.getActiveJobCount(crawlId);

  if (activeJobCount === 0) {
    console.log(`Finalizing crawl ${crawlId} with status: ${status}`);
    // If the crawl was stopping, mark it as stopped instead of failed/crawled
    const finalStatus = stoppingCrawls.has(crawlId) ? "crawled" : status;

    await services.dbService.updateJobStatus(crawlId, finalStatus, {
      completed_at: new Date().toISOString(),
    });

    await Promise.all([services.redisService.cleanup(crawlId), crawlQueue.clean(0, 0, "delayed")]);

    console.log(`Crawl ${crawlId} finalized and cleaned up`);
    // Clean up stopping state
    stoppingCrawls.delete(crawlId);
    // Reset current crawl tracking
    if (currentCrawlId === crawlId) {
      currentCrawlId = null;
      currentCrawlPriority = null;
      activeUrlCount = 0;
    }
  }

  await services.queueUpdateService.broadcastQueueUpdate();
}

// New function to initiate stopping of a crawl
async function stopCrawl(crawlId: string) {
  if (stoppingCrawls.has(crawlId)) {
    return; // Already stopping
  }

  console.log(`Initiating stop for crawl ${crawlId}`);
  stoppingCrawls.add(crawlId);

  // Move all waiting and delayed jobs to failed state
  const jobsToRemove = await crawlQueue.getJobs(["waiting", "delayed"]);
  const crawlJobs = jobsToRemove.filter((job) => job.data.id === crawlId);

  await Promise.all(
    crawlJobs.map(async (job) => {
      try {
        // Remove job from queue and mark it as failed
        await job.moveToFailed({
          message: "Crawl stopped by user",
        });
        await handleJobCompletion(crawlId, job.id!, "failed");
      } catch (error) {
        console.error(`Error removing job ${job.id}:`, error);
      }
    })
  );

  // If no active jobs, finalize immediately
  const activeJobCount = await ServiceFactory.getServices().redisService.getActiveJobCount(crawlId);
  if (activeJobCount === 0) {
    await handleJobCompletion(crawlId, "stop", "crawled");
  }
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
      // Check if this crawl is being stopped
      if (stoppingCrawls.has(crawlId)) {
        console.log(`Skipping job ${jobId} as crawl ${crawlId} is stopping`);
        return { skipped: true, message: "Crawl is stopping" };
      }

      // Rest of your existing worker logic...
      if (currentCrawlId === null) {
        currentCrawlId = crawlId;
        currentCrawlPriority = priority;
        activeUrlCount = 0;
      } else if (currentCrawlId !== crawlId) {
        if (priority > (currentCrawlPriority || 0)) {
          console.log(
            `Higher priority job detected (${priority} > ${currentCrawlPriority}). Switching crawls.`
          );

          const activeJobs = await crawlQueue.getJobs(["active", "waiting"]);
          const currentCrawlJobs = activeJobs.filter((j) => j.data.id === currentCrawlId);

          await Promise.all(currentCrawlJobs.map((j) => j.moveToDelayed(Date.now() + 5000)));

          currentCrawlId = crawlId;
          currentCrawlPriority = priority;
          activeUrlCount = 0;
        } else {
          const delayMs = 5000;
          console.log(
            `Worker busy with crawl ${currentCrawlId}, delaying job ${jobId} for ${delayMs}ms`
          );
          await job.moveToDelayed(Date.now() + delayMs);
          return { delayed: true, message: "Worker busy with another crawl" };
        }
      }

      if (activeUrlCount >= MAX_CONCURRENT_URLS) {
        const delayMs = 1000;
        console.log(`Reached max concurrent URLs (${MAX_CONCURRENT_URLS}), delaying job ${jobId}`);
        await job.moveToDelayed(Date.now() + delayMs);
        return { delayed: true, message: "Max concurrent URLs reached" };
      }

      activeUrlCount++;

      try {
        // Check again if stopping was initiated while we were setting up
        if (stoppingCrawls.has(crawlId)) {
          return { skipped: true, message: "Crawl is stopping" };
        }

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

        // If the crawl was marked as stopping while we were processing,
        // don't add any new URLs to the queue
        if (!stoppingCrawls.has(crawlId)) {
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

              // Only add new jobs if we're not stopping
              if (!stoppingCrawls.has(crawlId)) {
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
                          delay: index * 100,
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
          }
        }

        return result;
      } finally {
        activeUrlCount = Math.max(0, activeUrlCount - 1);
      }
    } catch (error) {
      console.error(`Job ${jobId} failed:`, error);
      throw error;
    }
  },
  {
    ...WORKER_CONNECTION_CONFIG,
    concurrency: MAX_CONCURRENT_URLS,
    limiter: {
      max: 20,
      duration: 1000,
    },
  }
);

// Export the stopCrawl function so it can be called from your API endpoint
export { stopCrawl };

// Existing event handlers...
worker.on("completed", async (job) => {
  const crawlId = job.data.id;
  const jobId = job.id!;
  await handleJobCompletion(crawlId, jobId, "crawled");
});

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
