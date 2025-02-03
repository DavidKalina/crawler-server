import { serviceFactory } from "../services/serviceFactory";
import { supabase } from "../lib/supabaseClient";

export class JobScheduler {
  private services = serviceFactory.getServices();
  private isRunning = false;
  private checkInterval: NodeJS.Timeout | null = null;

  async start(intervalMs: number = 5000) {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.checkInterval = setInterval(() => this.checkAndScheduleJobs(), intervalMs);
    console.log("Job scheduler started");
  }

  async stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.isRunning = false;
    console.log("Job scheduler stopped");
  }

  private async checkAndScheduleJobs() {
    try {
      // ---------------------------
      // 1. Schedule Pending Jobs
      // ---------------------------
      // Retrieve the waiting jobs from BullMQ
      const waitingJobs = await this.services.queueService.getWaitingJobs();

      // Fetch the earliest pending job from your database
      const { data: pendingJobs, error: jobError } = await supabase
        .from("web_crawl_jobs")
        .select("*")
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(1);

      if (jobError) {
        console.error("Error fetching pending jobs:", jobError);
        return;
      }

      if (pendingJobs?.[0]) {
        const job = pendingJobs[0];

        // Check if this job is already in the waiting queue
        const isAlreadyQueued = waitingJobs.some((queuedJob) => queuedJob.data.id === job.id);

        if (isAlreadyQueued) {
          console.log(`Job ${job.id} is already in the waiting queue. Skipping scheduling.`);
        } else {
          // Schedule the job
          try {
            await this.services.queueService.addJob({
              id: job.id,
              url: job.start_url,
              maxDepth: job.max_depth,
              currentDepth: 0,
              userId: job.user_id,
            });
            console.log(`Scheduled job ${job.id} for user ${job.user_id}`);
          } catch (error) {
            console.error(`Error adding job ${job.id} to queue:`, error);
          }
        }
      }

      // ---------------------------
      // 2. Check for Cancelled (Stopping) Jobs
      // ---------------------------
      // Fetch jobs that have been marked as "stopping" (with stop_requested_at set)
      const { data: stoppingJobs, error: stoppingError } = await supabase
        .from("web_crawl_jobs")
        .select("*")
        .eq("status", "stopping")
        // This condition ensures we're only looking at jobs that have been requested to stop.
        .not("stop_requested_at", "is", null);

      if (stoppingError) {
        console.error("Error fetching stopping jobs:", stoppingError);
      } else if (stoppingJobs && stoppingJobs.length > 0) {
        for (const job of stoppingJobs) {
          // Check if there are any active jobs for this crawl (using the job id as the crawl id)
          const activeCount = await this.services.redisService.getActiveJobCount(job.id);
          if (activeCount === 0) {
            // No active jobs remain—update status to "canceled"
            const { error: updateError } = await supabase
              .from("web_crawl_jobs")
              .update({
                status: "canceled",
                completed_at: new Date().toISOString(),
              })
              .eq("id", job.id);
            if (updateError) {
              console.error(`Error updating job ${job.id} to canceled:`, updateError);
            } else {
              console.log(`Job ${job.id} successfully updated to canceled.`);
            }
          } else {
            console.log(`Job ${job.id} still has ${activeCount} active jobs. Waiting to cancel.`);
          }
        }
      }
    } catch (error) {
      console.error("Error in job scheduler:", error);
    }
  }
}

// Create a singleton instance of the job scheduler.
export const jobScheduler = new JobScheduler();
