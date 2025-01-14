import { Worker } from "bullmq";
import { WORKER_CONNECTION_CONFIG } from "../constants/workerConnectionConfig";
import { supabase } from "../lib/supabaseClient";
import { crawlQueue } from "../queues/crawlQueue";
import { ServiceFactory } from "../services/serviceFactory";
import { crawlPage } from "../utils/crawlPage";
import { UrlValidator } from "../utils/UrlValidator";

const worker = new Worker(
  "crawl-jobs",
  async (job) => {
    const services = ServiceFactory.getServices();
    const crawlId = job.data.id;
    const jobId = job.id!;
    const url = job.data.url;

    console.log(`Starting job ${jobId} for URL: ${url}`);

    try {
      // Normalize URL
      const normalizedUrl = UrlValidator.normalizeUrl(url);

      if (!normalizedUrl) {
        console.log(`Invalid URL format: ${url}`);
        throw new Error("Invalid URL format");
      }

      // Fast check in Redis if URL was already processed
      const isProcessed = await services.redisService.isUrlProcessed(crawlId, normalizedUrl);
      if (isProcessed) {
        console.log(`Skipping already processed URL: ${normalizedUrl}`);
        return { skipped: true, url: normalizedUrl };
      }

      // Add URL to Redis and track this job in the database
      await Promise.all([
        services.redisService.addProcessedUrl(crawlId, normalizedUrl),
        services.redisService.addActiveJob(crawlId, jobId),
      ]);

      // Attempt to crawl the page
      console.log(`Crawling page: ${normalizedUrl}`);
      const result = await crawlPage(job.data);
      console.log(`[Debug] Processing URL batch. Total URLs found: ${result.links.length}`);

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

        console.log({ crawlId });
        // Increment total pages crawled
        await services.dbService.incrementPagesCount(crawlId);

        // Add new links to the queue if within depth limit
        if (result.depth < job.data.maxDepth) {
          console.log(`Processing ${result.links.length} links from ${normalizedUrl}`);

          // Filter and normalize URLs
          const normalizedUrls = result.links
            .map((url) => UrlValidator.normalizeUrl(url))
            .filter(Boolean) as string[];

          console.log(`[Debug] After normalization: ${normalizedUrls.length} URLs`);

          // Batch check URLs in Redis
          const processedStatuses = await services.redisService.areUrlsProcessed(
            crawlId,
            normalizedUrls
          );

          const newUrls = normalizedUrls.filter((_, index) => !processedStatuses[index]);

          console.log(`[Debug] After Redis check: ${newUrls.length} URLs to process`);

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
              await services.redisService.addActiveJob(crawlId, newJob.id!);
              console.log(`Added new job ${newJob.id} for URL: ${newUrl}`);
            } catch (error) {
              console.error(`Failed to add job for URL ${newUrl}:`, error);
            }
          }

          // Batch add new URLs to Redis processed set
        }
      } else {
        console.log(`Duplicate page skipped: ${normalizedUrl}`);
      }

      console.log(`Job ${jobId} completed successfully`);

      await services.redisService.addProcessedUrl(crawlId, url);
      return result;
    } catch (error) {
      console.error(`Job ${jobId} failed:`, error);

      throw error;
    }
  },
  WORKER_CONNECTION_CONFIG
);

// Completion handler
worker.on("completed", async (job) => {
  const services = ServiceFactory.getServices();
  const crawlId = job.data.id;
  const jobId = job.id!;

  console.log(`Handling completion for job ${jobId}`);

  await services.redisService.removeActiveJob(crawlId, jobId);
  const activeJobCount = await services.redisService.getActiveJobCount(crawlId);

  if (activeJobCount === 0) {
    console.log(`Completing crawl ${crawlId}`);
    await services.dbService.updateJobStatus(crawlId, "crawled");
    await Promise.all([services.redisService.cleanup(crawlId)]);
    console.log(`Crawl ${crawlId} completed and cleaned up`);
  }

  await services.queueUpdateService.broadcastQueueUpdate();
});

worker.on("failed", async (job, error) => {
  if (job) {
    const services = ServiceFactory.getServices();
    const crawlId = job.data.id;
    const jobId = job.id!;
    console.log(`Handling failure for job ${jobId}:`, error);

    await services.redisService.removeActiveJob(crawlId, jobId);
    const activeJobCount = await services.redisService.getActiveJobCount(crawlId);

    if (activeJobCount === 0) {
      console.log(`Marking crawl ${crawlId} as failed`);
      await services.dbService.updateJobStatus(crawlId, "failed");
      await Promise.all([services.redisService.cleanup(crawlId)]);
      console.log(`Crawl ${crawlId} marked as failed and cleaned up`);
    }
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
