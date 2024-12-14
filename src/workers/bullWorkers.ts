import { Worker, Queue } from "bullmq";
import { createClient } from "@supabase/supabase-js";
import { Database } from "src/database.types";
import { crawlPage } from "src";

// Initialize Supabase client
const supabase = createClient<Partial<Database>>(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_KEY!
);

// Initialize the queue
const crawlQueue = new Queue("crawl-jobs", {
  connection: {
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT || "6379"),
  },
});

// Create a worker to process crawl jobs
const worker = new Worker(
  "crawl-jobs",
  async (job) => {
    try {
      // Update job status to active
      await supabase.from("web_crawl_jobs").update({ status: "active" }).eq("id", job.data.id);

      // Get the crawl result
      const result = await crawlPage(job.data);

      // Store the crawled page
      const { data: pageData, error: pageError } = await supabase
        .from("crawled_pages")
        .insert({
          url: result.url,
          title: result.title,
          content_text: result.content,
          extracted_content: result.extractedContent,
          depth: result.depth,
          crawl_job_id: job.data.id,
          processing_status: "completed",
        })
        .select()
        .single();

      if (pageError) throw pageError;

      // Add new links to the queue if within depth limit
      if (result.depth < job.data.maxDepth) {
        const newJobs = result.links.map((url) => ({
          id: job.data.id,
          url,
          maxDepth: job.data.maxDepth,
          currentDepth: result.depth + 1,
          parentUrl: result.url,
        }));

        // Add all new URLs to the queue
        await Promise.all(
          newJobs.map((jobData) =>
            crawlQueue.add("crawl", jobData, {
              removeOnComplete: true,
              removeOnFail: false,
            })
          )
        );
      }

      // Update crawl job stats
      await supabase.rpc("aggregate_metrics", {
        p_job_id: job.data.id,
        p_period: "5m",
        p_start: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
        p_end: new Date().toISOString(),
      });

      // Log successful crawl
      await supabase.from("crawler_logs").insert({
        crawl_job_id: job.data.id,
        level: "info",
        message: `Successfully crawled ${result.url}`,
        metadata: {
          depth: result.depth,
          newLinks: result.links.length,
        },
      });
    } catch (error) {
      // Log crawl error
      await supabase.from("crawler_logs").insert({
        crawl_job_id: job.data.id,
        level: "error",
        message: `Failed to crawl: ${error}`,
        metadata: {
          url: job.data.url,
          depth: job.data.currentDepth,
        },
      });

      // Re-throw to mark job as failed
      throw error;
    }
  },
  {
    connection: {
      host: process.env.REDIS_HOST || "localhost",
      port: parseInt(process.env.REDIS_PORT || "6379"),
    },
    removeOnComplete: {
      age: 24 * 3600, // Keep completed jobs for 24 hours
      count: 1000, // Keep last 1000 completed jobs
    },
    removeOnFail: {
      age: 7 * 24 * 3600, // Keep failed jobs for 7 days
    },
  }
);

// Handle worker events
worker.on("completed", async (job) => {
  // Update total pages crawled
  await supabase.rpc("jsonb_deep_merge", {
    current: {},
    new: {
      total_pages_crawled: job.data.currentDepth + 1,
    },
  });
});

worker.on("failed", async (job, error) => {
  if (job) {
    await supabase
      .from("web_crawl_jobs")
      .update({
        status: "failed",
        processing_stats: {
          last_error: error.message,
          failed_at: new Date().toISOString(),
        },
      })
      .eq("id", job.data.id);
  }
});

export default worker;
