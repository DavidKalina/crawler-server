import { Worker, Job } from "bullmq";
import { WORKER_CONNECTION_CONFIG } from "../constants/workerConnectionConfig";
import { supabase } from "../lib/supabaseClient";
import { crawlQueue } from "../queues/crawlQueue";
import { serviceFactory } from "../services/serviceFactory";
import { crawlPage } from "../utils/crawlPage";
import { UrlValidator } from "../utils/UrlValidator";

// State management
let currentCrawlId: string | null = null;
let currentCrawlPriority: number | null = null;
let activeUrlCount = 0;
const MAX_CONCURRENT_URLS = 10;
const stoppingCrawls = new Set<string>();

interface CrawlResult {
  url: string;
  title: string;
  content: string;
  extractedContent: any;
  depth: number;
  links: string[];
  skipped?: boolean;
  delayed?: boolean;
  message?: string;
}

// Core worker logic
const worker = new Worker(
  crawlQueue.name,
  async (job) => {
    const services = serviceFactory.getServices();
    const { id: crawlId, url, maxDepth, priority = 1 } = job.data;

    // Check if job should be processed
    if (await services.queueService.isJobStopping(crawlId)) {
      return { skipped: true, message: "Crawl is stopping or stopped" };
    }

    // Handle job priority and concurrency
    if (await shouldDelayJob(job)) {
      return { delayed: true, message: "Job delayed due to conditions" };
    }

    activeUrlCount++;
    try {
      const normalizedUrl = UrlValidator.normalizeUrl(url);
      if (!normalizedUrl) {
        throw new Error("Invalid URL format");
      }

      if (await services.redisService.isUrlProcessed(crawlId, normalizedUrl)) {
        return { skipped: true, url: normalizedUrl };
      }

      await setupJobProcessing(crawlId, job.id!, normalizedUrl);
      console.log(`Crawling page: ${normalizedUrl} (Active URLs: ${activeUrlCount})`);

      return await crawlPage(job.data);
    } finally {
      activeUrlCount = Math.max(0, activeUrlCount - 1);
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
// Event handlers
worker.on("completed", async (job, result: CrawlResult) => {
  if (!result.skipped && !result.delayed) {
    await processCompletedJob(job.data.id, job.id!, result, job.data);
  }
});

worker.on("failed", async (job, error) => {
  if (job) {
    const services = serviceFactory.getServices();
    const crawlId = job.data.id;

    if (error?.name !== "QuotaExceededError") {
      console.log(`Job ${job.id} failed:`, error);
      await services.dbService.incrementErrorsCount(crawlId);
    }
  }
});

async function shouldDelayJob(job: Job): Promise<boolean> {
  const { id: crawlId, priority = 1 } = job.data;

  if (currentCrawlId === null) {
    currentCrawlId = crawlId;
    currentCrawlPriority = priority;
    activeUrlCount = 0;
    return false;
  }

  if (currentCrawlId !== crawlId) {
    if (priority > (currentCrawlPriority || 0)) {
      await switchToHigherPriorityCrawl(crawlId, priority);
      return false;
    }
    await job.moveToDelayed(Date.now() + 5000);
    return true;
  }

  if (activeUrlCount >= MAX_CONCURRENT_URLS) {
    await job.moveToDelayed(Date.now() + 1000);
    return true;
  }

  return false;
}

async function setupJobProcessing(crawlId: string, jobId: string, normalizedUrl: string) {
  const services = serviceFactory.getServices();

  if (!stoppingCrawls.has(crawlId)) {
    const activeJobCount = await services.redisService.getActiveJobCount(crawlId);
    if (activeJobCount === 0) {
      await services.dbService.updateJobStatus(crawlId, "running");
    }
  }

  await Promise.all([
    services.redisService.addProcessedUrl(crawlId, normalizedUrl),
    services.redisService.addActiveJob(crawlId, jobId),
  ]);
}

async function processCompletedJob(
  crawlId: string,
  jobId: string,
  result: CrawlResult,
  jobData: any
) {
  const services = serviceFactory.getServices();

  // Don't process if job is stopping
  if (await services.queueService.isJobStopping(crawlId)) {
    return;
  }

  try {
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
      if (upsertError.code === "PGRST116") {
        console.log(`Crawl job ${crawlId} no longer exists in database`);
        await services.redisService.clearActiveJobs(jobId);
        await services.queueService.removeJob(crawlId);
        // Maybe add logic to clean up this worker
        return;
      }
      console.log("ERROR UPSERTING PAGE", upsertError);
    }

    if (upsertResult?.[0]?.quota_exceeded) {
      throw {
        name: "QuotaExceededError",
        message: `Monthly quota exceeded. ${upsertResult[0].pages_remaining} pages remaining`,
      };
    }

    if (upsertResult?.[0]?.inserted) {
      await services.dbService.incrementPagesCount(crawlId);
      await processNewUrls(crawlId, result, jobData);
    }
  } catch (error) {
    console.log("ERROR OCCURED TRYING TO INVOKE RPC");
  }
}

async function processNewUrls(crawlId: string, result: CrawlResult, jobData: any) {
  if (result.depth >= jobData.maxDepth || stoppingCrawls.has(crawlId)) return;

  const services = serviceFactory.getServices();
  const normalizedUrls = result.links
    .map((url) => UrlValidator.normalizeUrl(url))
    .filter(Boolean) as string[];

  const processedStatuses = await services.redisService.areUrlsProcessed(crawlId, normalizedUrls);

  const newUrls = normalizedUrls.filter((_, index) => !processedStatuses[index]);

  await Promise.all(
    newUrls.map(async (newUrl) => {
      try {
        const newJob = await services.queueService.addJob({
          id: crawlId,
          url: newUrl,
          maxDepth: jobData.maxDepth,
          currentDepth: result.depth + 1,
          parentUrl: result.url,
          userId: "",
        });
        await services.redisService.addActiveJob(crawlId, newJob.id!);
      } catch (error) {
        console.error(`Failed to add job for URL ${newUrl}:`, error);
      }
    })
  );
}

async function switchToHigherPriorityCrawl(newCrawlId: string, newPriority: number) {
  console.log(
    `Higher priority job detected (${newPriority} > ${currentCrawlPriority}). Switching crawls.`
  );

  const activeJobs = await crawlQueue.getJobs(["active", "waiting"]);
  const currentCrawlJobs = activeJobs.filter((j) => j.data.id === currentCrawlId);

  await Promise.all(currentCrawlJobs.map((j) => j.moveToDelayed(Date.now() + 5000)));

  currentCrawlId = newCrawlId;
  currentCrawlPriority = newPriority;
  activeUrlCount = 0;
}

export default worker;
