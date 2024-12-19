import axios from "axios";
import { CrawlDebugInfo, CrawlJob, CrawlResult } from "src";
import { ContentExtractor } from "src/classes/ContentExtractor";
import { CRAWL_REQUEST_CONFIG } from "src/constants/crawlRequestConfig";
import { EMPTY_CRAWL_RESULT } from "src/constants/emptyCrawlResults";
import { DuplicateUrlError, RobotsNotAllowedError } from "src/errors/crawler/CrawlerErrorTypes";
import { supabase } from "src/lib/supabaseClient";
import { consultRobotsTxt } from "./consultRobotsTxt";
import { domainGuard } from "./DomainGuard";
import { loadContentIntoCheerio } from "./loadContentIntoCheerio";
import { UrlValidator } from "./UrlValidator";
import { validateCrawlRequest } from "./validateCrawlRequest";
import { verifyContentExtraction } from "./verifyContentExtraction";

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

    const response = await axios.get(normalizedUrl, CRAWL_REQUEST_CONFIG);

    debugInfo.responseStatus = response.status;
    debugInfo.responseSize = response?.data?.length;

    if (response.status !== 200) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const $ = await loadContentIntoCheerio(jobId, response, debugInfo);

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
          const normalizedLink = UrlValidator.normalizeUrl(link.href, normalizedUrl);
          if (!normalizedLink) continue;

          if (seenUrls.has(normalizedLink)) continue;
          seenUrls.add(normalizedLink);

          if (crawledUrls.get(jobId)?.has(normalizedLink)) continue;

          if (!domainGuard.isUrlAllowed(normalizedLink)) continue;

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
