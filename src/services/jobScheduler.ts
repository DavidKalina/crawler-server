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
      // Retrieve the waiting jobs from BullMQ
      // (Assuming getWaitingJobs returns an array of job objects with an `id` property)
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
          return;
        }

        // If not queued yet, schedule the job
        try {
          await this.services.queueService.addJob({
            id: job.id,
            url: job.start_url,
            maxDepth: job.max_depth,
            currentDepth: 0,
            userId: job.user_id,
          });
          console.log(`Scheduled job ${job.id} for user ${job.user_id}`);
          await this.services.queueUpdateService.broadcastQueueUpdate();

          // Optionally, update the job status here if you want to keep your DB in sync
          // await supabase.from("web_crawl_jobs").update({ status: "active" }).eq("id", job.id);
        } catch (error) {
          console.error(`Error adding job ${job.id} to queue:`, error);
          // Optionally revert job status if necessary:
          // await supabase.from("web_crawl_jobs").update({ status: "pending" }).eq("id", job.id);
        }
      }
    } catch (error) {
      console.error("Error in job scheduler:", error);
    }
  }
}

// Create singleton instance
export const jobScheduler = new JobScheduler();
