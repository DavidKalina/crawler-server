import { Worker } from "bullmq";
import { WORKER_CONNECTION_CONFIG } from "../constants/workerConnectionConfig";
import { supabase } from "../lib/supabaseClient";
import { crawlQueue } from "../queues/crawlQueue";
import { ServiceFactory } from "../services/serviceFactory";
import { crawlPage } from "../utils/crawlPage";
import { UrlValidator } from "../utils/UrlValidator";

// Keep track of the current crawl job being processed
let currentCrawlId: string | null = null;

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

    try {
      // Check for quota exceeded before starting
      const { data: quotaCheck } = await supabase.rpc("check_crawl_quota", {
        p_crawl_job_id: crawlId,
      });

      if (quotaCheck?.[0]?.quota_exceeded) {
        await handleJobCompletion(crawlId, jobId, "failed");
        throw {
          name: "QuotaExceededError",
          message: `Monthly quota exceeded. ${quotaCheck[0].pages_remaining} pages remaining`,
        };
      }

      // Check if this is a new crawl job
      if (currentCrawlId === null) {
        currentCrawlId = crawlId;
      } else if (currentCrawlId !== crawlId) {
        // If we're already processing a different crawl, delay this job
        const delayMs = 5000;
        console.log(
          `Worker busy with crawl ${currentCrawlId}, delaying job ${jobId} for ${delayMs}ms`
        );
        await job.moveToDelayed(Date.now() + delayMs);
        return { delayed: true, message: "Worker busy with another crawl" };
      }

      console.log(`Starting job ${jobId} for URL: ${url}`);

      const activeJobCount = await services.redisService.getActiveJobCount(crawlId);
      if (activeJobCount === 0) {
        // This is the first job, update status to running
        await services.dbService.updateJobStatus(crawlId, "running");
        console.log(`Updated crawl ${crawlId} status to running`);
      }

      const normalizedUrl = UrlValidator.normalizeUrl(url);
      if (!normalizedUrl) {
        console.log(`Invalid URL format: ${url}`);
        throw new Error("Invalid URL format");
      }

      const isProcessed = await services.redisService.isUrlProcessed(crawlId, normalizedUrl);
      if (isProcessed) {
        console.log(`Skipping already processed URL: ${normalizedUrl}`);
        return { skipped: true, url: normalizedUrl };
      }

      await Promise.all([
        services.redisService.addProcessedUrl(crawlId, normalizedUrl),
        services.redisService.addActiveJob(crawlId, jobId),
      ]);

      console.log(`Crawling page: ${normalizedUrl}`);
      const result = await crawlPage(job.data);

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

      if (upsertResult?.[0]?.quota_exceeded) {
        await handleJobCompletion(crawlId, jobId, "failed");
        throw {
          name: "QuotaExceededError",
          message: `Monthly quota exceeded. ${upsertResult[0].pages_remaining} pages remaining`,
        };
      }

      // Only increment counter and process links if this was a new page
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

          // Add all new jobs in a batch
          await Promise.all(
            newUrls.map(async (newUrl) => {
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
    } catch (error) {
      console.error(`Job ${jobId} failed:`, error);
      throw error;
    }
  },
  {
    ...WORKER_CONNECTION_CONFIG,
    limiter: {
      max: 1,
      duration: 1000,
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
