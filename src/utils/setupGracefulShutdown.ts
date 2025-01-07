import { JobType, Worker } from "bullmq";
import { Server } from "http";

// Add this to your index.ts imports
import { supabase } from "../lib/supabaseClient";
import { crawlQueue } from "../queues/crawlQueue";

export async function setupGracefulShutdown(server: Server, worker: Worker) {
  async function shutdown() {
    console.log("Shutting down gracefully...");

    // 1. Stop accepting new requests
    server.close(() => {
      console.log("HTTP server closed");
    });

    try {
      // 2. Close the worker and drain its connections
      console.log("Closing worker...");
      await worker.close();

      // 3. Get all active jobs
      const jobStates = ["waiting", "active", "delayed", "failed"] as JobType[];
      const jobs = await crawlQueue.getJobs(jobStates);

      // 4. Group jobs by crawl ID
      const jobsByCrawlId = new Map<string, string[]>();
      jobs.forEach((job) => {
        const crawlId = job.data.id;
        if (!jobsByCrawlId.has(crawlId)) {
          jobsByCrawlId.set(crawlId, []);
        }
        jobsByCrawlId.get(crawlId)?.push(job.id!);
      });

      // 5. Process each crawl's jobs
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
              shutdown_at: new Date().toISOString(),
              cleared_job_count: jobIds.length,
            },
          })
          .eq("id", crawlId);
      }

      // 6. Close the queue connection
      await crawlQueue.close();

      console.log("Graceful shutdown completed");
      process.exit(0);
    } catch (error) {
      console.error("Error during graceful shutdown:", error);
      process.exit(1);
    }
  }

  // Handle different termination signals
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
