// services/queueService.ts
import { Job, JobType } from "bullmq";
import { CrawlJob } from "../types/crawlTypes";
import { QueueJobInfo, QueueStats } from "../types/queueTypes";
import { crawlQueue } from "../queues/crawlQueue";
import { serviceFactory } from "./serviceFactory";

export class QueueService {
  private static instance: QueueService | null = null;

  constructor() {
    console.log("=".repeat(50));
    console.log("QueueService being instantiated with queue:", crawlQueue.name);
    console.log("=".repeat(50));
  }

  public static getInstance(): QueueService {
    if (!QueueService.instance) {
      QueueService.instance = new QueueService();
    }
    return QueueService.instance;
  }

  async stopCrawl(crawlId: string): Promise<void> {
    console.log(`[QueueService] Stopping crawl ${crawlId}`);
    const services = serviceFactory.getServices();

    try {
      // Mark as stopping in DB first
      await services.dbService.updateJobStatus(crawlId, "stopping", {
        stop_requested_at: new Date().toISOString(),
      });

      // Get all jobs for this crawl
      const crawlJobs = await this.getJobsByCrawlId(crawlId);

      // Handle different job states
      for (const job of crawlJobs) {
        try {
          const actualJob = await crawlQueue.getJob(job.id);
          if (!actualJob) continue;

          const state = await actualJob.getState();

          if (state === "active") {
            // For active jobs, try to move to failed state to release lock
            try {
              await actualJob.moveToFailed(new Error("Job canceled"), true);
              await services.redisService.markJobForStopping(job.id);
            } catch (err) {
              console.log(`Could not move job ${job.id} to failed: ${err}`);
            }
          } else {
            // For non-active jobs, remove them
            try {
              await actualJob.remove();
            } catch (err) {
              console.log(`Could not remove job ${job.id}: ${err}`);
            }
          }
        } catch (err) {
          console.error(`Error processing job ${job.id}:`, err);
        }
      }

      // Clear Redis tracking last
      await services.redisService.clearActiveJobs(crawlId);
    } catch (error) {
      console.error(`[QueueService] Error stopping crawl ${crawlId}:`, error);
      throw error;
    }
  }

  async isJobStopping(crawlId: string): Promise<boolean> {
    const services = serviceFactory.getServices();
    const status = await services.dbService.getJobStatus(crawlId);
    return status === "stopping" || status === "stopped";
  }

  async getQueueStats(): Promise<QueueStats> {
    return {
      waitingCount: await crawlQueue.getWaitingCount(),
      activeCount: await crawlQueue.getActiveCount(),
      completedCount: await crawlQueue.getCompletedCount(),
      failedCount: await crawlQueue.getFailedCount(),
    };
  }

  async getWaitingJobs() {
    return await crawlQueue.getWaiting();
  }

  async addJob(data: CrawlJob) {
    return crawlQueue.add("crawl-jobs", data);
  }

  async getRecentJobs(limit: number = 10): Promise<QueueJobInfo[]> {
    // Get jobs from all relevant states
    const jobStates: JobType[] = ["waiting", "active", "completed", "failed"];
    const jobs = await crawlQueue.getJobs(jobStates, 0, limit);

    // Convert jobs to QueueJobInfo format
    return Promise.all(
      jobs.map(async (job) => ({
        id: job.id ?? "",
        state: await job.getState(),
        data: job.data,
        progress: job.progress || 0,
      }))
    );
  }

  async getJobsByCrawlId(crawlId: string): Promise<QueueJobInfo[]> {
    const jobStates: JobType[] = ["waiting", "active", "completed", "failed"];
    const jobs = await crawlQueue.getJobs(jobStates);

    // Filter jobs by crawl ID and convert to QueueJobInfo format
    const matchingJobs = jobs.filter((job) => job.data.id === crawlId);

    return Promise.all(
      matchingJobs.map(async (job) => ({
        id: job.id ?? "",
        state: await job.getState(),
        data: job.data,
        progress: job.progress || 0,
      }))
    );
  }

  async removeJob(jobId: string): Promise<void> {
    const services = serviceFactory.getServices();

    console.log(`[QueueService] Attempting to remove job ${jobId}`);
    try {
      const job = await crawlQueue.getJob(jobId);
      if (job) {
        const state = await job.getState();

        // If job is active, we can't remove it - mark it for stopping instead
        if (state === "active") {
          console.log(`[QueueService] Job ${jobId} is active, marking for stopping`);
          // Store in Redis/DB that this job should stop
          await services.redisService.markJobForStopping(jobId);
          return;
        }

        // For non-active jobs, attempt removal
        try {
          await job.remove();
          console.log(`[QueueService] Successfully removed job ${jobId}`);
        } catch (error: any) {
          if (error.message.includes("locked")) {
            console.log(`[QueueService] Job ${jobId} is locked, cannot remove`);
            // Since we can't force remove, mark it for stopping instead
            await services.redisService.markJobForStopping(jobId);
          } else {
            throw error;
          }
        }
      } else {
        console.log(`[QueueService] Job ${jobId} not found`);
      }
    } catch (error) {
      console.error(`[QueueService] Error removing job ${jobId}:`, error);
      // Log error but don't throw
    }
  }

  async clearJobs() {
    const jobStates: JobType[] = ["waiting", "active", "delayed", "failed"];
    const jobs = await crawlQueue.getJobs(jobStates);

    await Promise.all(jobs.map((job) => job.remove()));
    return jobs.length;
  }

  async getJobState(jobId: string): Promise<string | null> {
    const job = await crawlQueue.getJob(jobId);
    if (!job) return null;
    return job.getState();
  }
}

export const queueService = QueueService.getInstance();
