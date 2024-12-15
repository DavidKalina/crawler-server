import { CrawlDebugInfo, CrawlJob, CrawlResult } from "src";
import axios from "axios";
import robotsParser from "robots-parser";
import { ContentExtractor } from "src/classes/ContentExtractor";
import { domainGuard } from "./DomainGuard";
import { UrlValidator } from "./UrlValidator";
import * as cheerio from "cheerio";
import { createClient } from "@supabase/supabase-js";
import { Database } from "src/database.types";

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

export function cleanupCrawlJob(jobId: string) {
  crawledUrls.delete(jobId);
}
