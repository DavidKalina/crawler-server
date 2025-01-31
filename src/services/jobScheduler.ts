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
      // First, check if there are any active jobs in the queue
      const queueStats = await this.services.queueService.getQueueStats();

      // If there are active jobs, skip scheduling new ones
      if (queueStats.activeCount > 0) {
        console.log("Queue has active jobs, skipping new job scheduling");
        return;
      }

      // Get all pending jobs ordered by creation date
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

      // If we have a pending job, schedule it
      if (pendingJobs?.[0]) {
        const job = pendingJobs[0];

        try {
          // Add job to the queue
          await this.services.queueService.addJob({
            id: job.id,
            url: job.start_url,
            maxDepth: job.max_depth,
            currentDepth: 0,
            userId: job.user_id,
          });

          console.log(`Scheduled job ${job.id} for user ${job.user_id}`);
          await this.services.queueUpdateService.broadcastQueueUpdate();
        } catch (error) {
          console.error(`Error adding job ${job.id} to queue:`, error);

          // Revert job status if queue addition fails
          await supabase.from("web_crawl_jobs").update({ status: "pending" }).eq("id", job.id);
        }
      }
    } catch (error) {
      console.error("Error in job scheduler:", error);
    }
  }
}

// Create singleton instance
export const jobScheduler = new JobScheduler();
