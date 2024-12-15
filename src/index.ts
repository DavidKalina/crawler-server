import { createClient } from "@supabase/supabase-js";
import axios from "axios";
import * as cheerio from "cheerio";
import express from "express";
import robotsParser from "robots-parser";
import { v4 as uuidv4 } from "uuid";
import { Database } from "./database.types";
import { ContentExtractor } from "./classes/ContentExtractor";
import { ExtractedContent } from "./types/contentTypes";
import dotenv from "dotenv";
import { UrlValidator } from "./utils/UrlValidator";
import { crawlQueue } from "./queues/crawlQueue";
import "./workers/bullWorkers";
import { domainGuard } from "./utils/DomainGuard";
import { JobType } from "bullmq";
console.log("Worker started and listening for jobs...");

dotenv.config();

// Types
interface CrawlJob {
  id: string;
  url: string;
  maxDepth: number;
  currentDepth: number;
  parentUrl?: string;
}
interface QueueJobInfo {
  id: string;
  state: string;
  data: any;
  progress: number | object;
}

interface CrawlDebugInfo {
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
  databaseJob: Database["public"]["Tables"]["web_crawl_jobs"]["Row"] | null;
  queueInfo: {
    mainJob: QueueJobInfo | null;
    childJobs: QueueJobInfo[];
    waitingCount: number;
    activeCount: number;
    completedCount: number;
    failedCount: number;
  };
}

interface CrawlResult {
  url: string;
  title: string | null;
  content: string | null;
  extractedContent: ExtractedContent;
  links: string[];
  depth: number;
}

// Initialize Express app
const app = express();
app.use(express.json());

// Initialize Supabase client
const supabase = createClient<Partial<Database>>(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_KEY!
);

const crawledUrls = new Map<string, Set<string>>();

export async function crawlPage(job: CrawlJob): Promise<CrawlResult> {
  const jobId = job.id;

  const debugInfo: CrawlDebugInfo = {
    url: job.url,
    timestamp: new Date().toISOString(),
  };

  // Initialize tracking for this job if needed
  if (!crawledUrls.has(jobId)) {
    crawledUrls.set(jobId, new Set());
  }

  try {
    // Check if URL was already crawled
    if (crawledUrls.get(jobId)?.has(job.url)) {
      throw new Error("URL already crawled");
    }

    // Validate and normalize URL
    const normalizedUrl = UrlValidator.normalizeUrl(job.url);
    if (!normalizedUrl) {
      throw new Error("Invalid URL format");
    }

    // Check domain restrictions
    if (!domainGuard.isUrlAllowed(normalizedUrl)) {
      throw new Error("URL domain not allowed");
    }

    // Mark URL as crawled
    crawledUrls.get(jobId)?.add(normalizedUrl);

    // Fetch robots.txt first
    const robotsUrl = new URL("/robots.txt", normalizedUrl).href;
    let robotsAllowed = true;
    try {
      const robotsResponse = await axios.get(robotsUrl);
      const robots = robotsParser(robotsUrl, robotsResponse.data);
      robotsAllowed = !!robots.isAllowed(normalizedUrl);
    } catch (error) {
      console.warn(`Could not fetch robots.txt for ${normalizedUrl}, proceeding with crawl`);
    }

    if (!robotsAllowed) {
      throw new Error("URL is not allowed by robots.txt");
    }

    const response = await axios.get(normalizedUrl, {
      headers: {
        "User-Agent": "YourBot/1.0 (+http://yourwebsite.com/bot)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Accept-Encoding": "gzip, deflate, br",
        Connection: "keep-alive",
      },
      timeout: 30000, // Increased timeout
      maxContentLength: 10 * 1024 * 1024, // 10MB limit
      validateStatus: null, // Allow all status codes for proper error handling
    });

    debugInfo.responseStatus = response.status;
    debugInfo.responseSize = response?.data?.length;

    if (response.status !== 200) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // Load content into cheerio with error handling
    let $: cheerio.CheerioAPI;
    try {
      $ = cheerio.load(response.data);
      debugInfo.cheerioLoadSuccess = true;
    } catch (error) {
      debugInfo.cheerioLoadSuccess = false;
      debugInfo.error = `Cheerio load failed: ${error.message}`;
      await supabase.from("crawler_logs").insert({
        crawl_job_id: jobId,
        level: "error",
        message: `Crawl failed: ${error.message}`,
        metadata: debugInfo,
      });
      throw error;
    }

    // Extract content with detailed logging
    let extractedContent;
    try {
      const contentExtractor = new ContentExtractor($, job.url);
      extractedContent = contentExtractor.extract();
      debugInfo.extractionSuccess = true;
      debugInfo.contentStats = {
        rawTextLength: extractedContent.rawText?.length,
        headingsCount: extractedContent.structuredContent.headings?.length,
        paragraphsCount: extractedContent.structuredContent.paragraphs?.length,
        listsCount: extractedContent.structuredContent.lists?.length,
        tablesCount: extractedContent.structuredContent.tables?.length,
        linksCount: extractedContent.structuredContent.links?.length,
      };
    } catch (error) {
      debugInfo.extractionSuccess = false;
      debugInfo.error = `Content extraction failed: ${error.message}`;
      throw error;
    }

    // Log debug info to database
    await supabase.from("crawler_logs").insert({
      crawl_job_id: jobId,
      level: "debug",
      message: "Content extraction debug info",
      metadata: debugInfo,
    });

    // Verify content before returning
    if (!extractedContent.rawText && extractedContent.structuredContent.paragraphs.length === 0) {
      throw new Error("Extraction succeeded but no content was extracted");
    }
    // Process and filter links
    const links: string[] = [];
    if (job.currentDepth < job.maxDepth) {
      const seenUrls = new Set<string>();

      for (const link of extractedContent.structuredContent.links) {
        try {
          // Normalize the URL
          const normalizedLink = UrlValidator.normalizeUrl(link.href, normalizedUrl);
          if (!normalizedLink) continue;

          // Skip if we've seen this URL before
          if (seenUrls.has(normalizedLink)) continue;
          seenUrls.add(normalizedLink);

          // Skip if already crawled
          if (crawledUrls.get(jobId)?.has(normalizedLink)) continue;

          // Verify domain is allowed
          if (!domainGuard.isUrlAllowed(normalizedLink)) continue;

          // Skip URLs that clearly aren't HTML content
          if (/\.(jpg|jpeg|png|gif|pdf|zip|exe)$/i.test(normalizedLink)) continue;

          links.push(normalizedLink);
        } catch (error) {
          console.warn(`Invalid link found: ${link.href}`);
        }
      }
    }

    return {
      url: normalizedUrl,
      title: extractedContent.structuredContent.title,
      content: extractedContent.rawText,
      extractedContent,
      links,
      depth: job.currentDepth,
    };
  } catch (error) {
    // Clean up tracking on terminal error
    if (error.message === "URL already crawled") {
      return {
        url: job.url,
        title: null,
        content: null,
        extractedContent: {
          rawText: "",
          structuredContent: {
            title: null,
            headings: [],
            paragraphs: [],
            lists: [],
            tables: [],
            links: [],
          },
        },
        links: [],
        depth: job.currentDepth,
      };
    }
    throw error;
  }
}

// Add cleanup function
export function cleanupCrawlJob(jobId: string) {
  crawledUrls.delete(jobId);
}

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

app.post("/api/queue/clear", async (req, res) => {
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
// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default app;
