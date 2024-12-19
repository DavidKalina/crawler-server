import { createClient } from "@supabase/supabase-js";
import axios from "axios";
import * as cheerio from "cheerio";
import { CrawlDebugInfo, CrawlJob, CrawlResult } from "src";
import { ContentExtractor } from "src/classes/ContentExtractor";
import { Database } from "src/database.types";
import { DuplicateUrlError, RobotsNotAllowedError } from "src/errors/crawler/CrawlerErrorTypes";
import { consultRobotsTxt } from "./consultRobotsTxt";
import { domainGuard } from "./DomainGuard";
import { UrlValidator } from "./UrlValidator";
import { validateCrawlRequest } from "./validateCrawlRequest";
import { verifyContentExtraction } from "./verifyContentExtraction";
import { EMPTY_CRAWL_RESULT } from "src/constants/emptyCrawlResults";

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

  if (!crawledUrls.has(jobId)) {
    crawledUrls.set(jobId, new Set());
  }

  try {
    const normalizedUrl = validateCrawlRequest(job, crawledUrls);
    crawledUrls.get(jobId)?.add(normalizedUrl);

    const isRobotsAllowed = await consultRobotsTxt(normalizedUrl);

    if (!isRobotsAllowed) {
      throw new RobotsNotAllowedError(normalizedUrl);
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
      Object.assign(debugInfo, {
        extractionSuccess: true,
        contentStats: {
          rawTextLength: extractedContent.rawText?.length,
          headingsCount: extractedContent.structuredContent.headings?.length,
          paragraphsCount: extractedContent.structuredContent.paragraphs?.length,
          listsCount: extractedContent.structuredContent.lists?.length,
          tablesCount: extractedContent.structuredContent.tables?.length,
          linksCount: extractedContent.structuredContent.links?.length,
        },
      });
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
    verifyContentExtraction(extractedContent);
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
    if (error instanceof DuplicateUrlError) {
      return { ...EMPTY_CRAWL_RESULT, url: job.url, depth: job.currentDepth };
    }
    throw error;
  }
}

export function cleanupCrawlJob(jobId: string) {
  crawledUrls.delete(jobId);
}
