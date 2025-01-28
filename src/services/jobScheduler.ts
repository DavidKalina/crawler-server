import { ServiceFactory } from "../services/serviceFactory";
import { supabase } from "../lib/supabaseClient";

export class JobScheduler {
  private services = ServiceFactory.getServices();
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
      // Get all users with pending jobs
      const { data: userResults, error: userError } = await supabase
        .from("web_crawl_jobs")
        .select("user_id")
        .eq("status", "pending")
        .order("created_at", { ascending: true });

      if (userError) {
        console.error("Error fetching users with pending jobs:", userError);
        return;
      }

      // Get unique user IDs
      const userIds = [...new Set(userResults?.map((r) => r.user_id))];

      for (const userId of userIds) {
        // Check if user has any running jobs
        const { data: runningJobs, error: runningError } = await supabase
          .from("web_crawl_jobs")
          .select("id")
          .eq("user_id", userId)
          .eq("status", "running");

        if (runningError) {
          console.error(`Error checking running jobs for user ${userId}:`, runningError);
          continue;
        }

        // If user has no running jobs, get their oldest pending job
        if (!runningJobs?.length) {
          const { data: nextJob, error: nextJobError } = await supabase.rpc(
            "start_next_pending_job",
            {
              p_user_id: userId,
            }
          );

          if (nextJobError) {
            console.error(`Error starting next job for user ${userId}:`, nextJobError);
            continue;
          }

          if (nextJob?.[0]) {
            const job = nextJob[0];
            try {
              // Add job to the queue
              await this.services.queueService.addJob({
                id: job.id,
                url: job.start_url,
                maxDepth: job.max_depth,
                currentDepth: 0,
                userId: job.user_id,
              });

              console.log(`Scheduled job ${job.id} for user ${userId}`);
              await this.services.queueUpdateService.broadcastQueueUpdate();
            } catch (error) {
              console.error(`Error adding job ${job.id} to queue:`, error);

              // Revert job status if queue addition fails
              await supabase.from("web_crawl_jobs").update({ status: "pending" }).eq("id", job.id);
            }
          }
        }
      }
    } catch (error) {
      console.error("Error in job scheduler:", error);
    }
  }
}

// Create singleton instance
export const jobScheduler = new JobScheduler();
