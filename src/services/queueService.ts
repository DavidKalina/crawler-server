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
      // 1. Mark the crawl as stopping in your database
      await services.dbService.updateJobStatus(crawlId, "stopping", {
        stop_requested_at: new Date().toISOString(),
      });

      // 2. Clear Redis tracking
      await services.redisService.clearActiveJobs(crawlId);

      // 3. Get all jobs for this crawl
      const crawlJobs = await this.getJobsByCrawlId(crawlId);

      // 4. Handle different job states separately
      const waitingJobs = crawlJobs.filter((job) => job.state === "waiting");
      const delayedJobs = crawlJobs.filter((job) => job.state === "delayed");
      const activeJobs = crawlJobs.filter((job) => job.state === "active");

      // Remove waiting and delayed jobs
      await Promise.allSettled([
        ...waitingJobs.map((job) => this.removeJob(job.id)),
        ...delayedJobs.map((job) => this.removeJob(job.id)),
      ]);

      // Log status of active jobs
      if (activeJobs.length > 0) {
        console.log(`[QueueService] ${activeJobs.length} active jobs will complete naturally`);
      }

      // Clean delayed jobs from queue
      await crawlQueue.clean(0, 0, "delayed");

      console.log(
        `[QueueService] Removed ${waitingJobs.length + delayedJobs.length} waiting/delayed jobs; ${
          activeJobs.length
        } active jobs will complete naturally`
      );
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
    console.log(`[QueueService] Attempting to remove job ${jobId}`);
    try {
      const job: Job = await crawlQueue.getJob(jobId);
      if (job) {
        const state = await job.getState();

        // If job is active, mark it for stopping but don't force remove
        if (state === "active") {
          console.log(`[QueueService] Job ${jobId} is active, marking for stopping`);
          // You can set a flag in Redis or your DB to mark this job for stopping
          return;
        }

        // For non-active jobs, try to remove with increasing levels of force
        try {
          // First try normal removal
          await job.remove();
        } catch (error: any) {
          // If normal removal fails, try with force option
          if (error.message.includes("locked")) {
            console.log(`[QueueService] Job ${jobId} is locked, attempting force remove`);
            await job.remove();
          } else {
            throw error;
          }
        }

        console.log(`[QueueService] Successfully removed job ${jobId}`);
      } else {
        console.log(`[QueueService] Job ${jobId} not found`);
      }
    } catch (error) {
      console.error(`[QueueService] Error removing job ${jobId}:`, error);
      // Don't throw the error - just log it and continue
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
