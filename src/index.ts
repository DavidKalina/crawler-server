import { createClient } from "@supabase/supabase-js";
import axios from "axios";
import { Queue } from "bullmq";
import * as cheerio from "cheerio";
import express from "express";
import robotsParser from "robots-parser";
import { v4 as uuidv4 } from "uuid";
import { Database } from "./database.types";
import { ContentExtractor } from "./classes/ContentExtractor";
import { ExtractedContent } from "./types/contentTypes";

// Types
interface CrawlJob {
  id: string;
  url: string;
  maxDepth: number;
  currentDepth: number;
  parentUrl?: string;
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
const supabase = createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_KEY!);

// Initialize BullMQ queue for crawl jobs
const crawlQueue = new Queue("crawl-jobs", {
  connection: {
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT || "6379"),
  },
});

// Utility functions
const isValidUrl = (url: string): boolean => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

const normalizeUrl = (url: string, baseUrl: string): string => {
  try {
    return new URL(url, baseUrl).href;
  } catch {
    return "";
  }
};

// Core crawling function
export async function crawlPage(job: CrawlJob): Promise<CrawlResult> {
  try {
    // Fetch robots.txt first
    const robotsUrl = new URL("/robots.txt", job.url).href;
    const robotsResponse = await axios.get(robotsUrl);
    const robots = robotsParser(robotsUrl, robotsResponse.data);

    if (!robots.isAllowed(job.url)) {
      throw new Error("URL is not allowed by robots.txt");
    }

    // Fetch the page
    const response = await axios.get(job.url, {
      headers: {
        "User-Agent": "YourBot/1.0 (+http://yourwebsite.com/bot)",
      },
    });

    const $ = cheerio.load(response.data);

    // Use the new content extractor
    const contentExtractor = new ContentExtractor($);
    const extractedContent = contentExtractor.extract();

    // Get links for crawling if we haven't reached max depth
    const links: string[] = [];
    if (job.currentDepth < job.maxDepth) {
      extractedContent.structuredContent.links.forEach((link) => {
        const normalizedUrl = normalizeUrl(link.href, job.url);
        if (normalizedUrl && isValidUrl(normalizedUrl)) {
          links.push(normalizedUrl);
        }
      });
    }

    return {
      url: job.url,
      title: extractedContent.structuredContent.title,
      content: extractedContent.rawText,
      extractedContent, // Add the full extracted content to the result
      links,
      depth: job.currentDepth,
    };
  } catch (error) {
    throw new Error(`Failed to crawl ${job.url}: ${error}`);
  }
}

// API Endpoints
app.post("/api/crawl", async (req, res) => {
  const { startUrl, maxDepth = 3 } = req.body;

  if (!startUrl || !isValidUrl(startUrl)) {
    res.status(400).json({ error: "Invalid start URL" });
  }

  try {
    // Create a new crawl job in the database
    const jobId = uuidv4();
    const { error: jobError } = await supabase.from("web_crawl_jobs").insert({
      id: jobId,
      start_url: startUrl,
      max_depth: maxDepth,
      status: "pending",
      total_pages_crawled: 0,
    });

    if (jobError) throw jobError;

    // Add initial URL to the queue
    await crawlQueue.add("crawl", {
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
    const { data: job, error } = await supabase
      .from("web_crawl_jobs")
      .select("*")
      .eq("id", jobId)
      .single();

    if (error) throw error;
    if (!job) res.status(404).json({ error: "Job not found" });

    res.json(job);
  } catch (error) {
    console.error("Failed to fetch job status:", error);
    res.status(500).json({ error: "Failed to fetch job status" });
  }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default app;
