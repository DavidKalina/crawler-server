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
      // 1. Mark the crawl as stopping in database
      await services.dbService.updateJobStatus(crawlId, "stopping", {
        stop_requested_at: new Date().toISOString(),
      });

      // 2. Clear Redis tracking
      await services.redisService.clearActiveJobs(crawlId);

      // 3. Get all jobs for this crawl
      const crawlJobs = await this.getJobsByCrawlId(crawlId);

      // 4. Handle different job states
      const waitingJobs = crawlJobs.filter((job) => job.state === "waiting");
      const delayedJobs = crawlJobs.filter((job) => job.state === "delayed");
      const activeJobs = crawlJobs.filter((job) => job.state === "active");

      // Attempt to remove waiting and delayed jobs
      await Promise.allSettled([
        ...waitingJobs.map((job) => this.removeJob(job.id)),
        ...delayedJobs.map((job) => this.removeJob(job.id)),
      ]);

      // For active jobs, mark them all for stopping
      if (activeJobs.length > 0) {
        await Promise.all(
          activeJobs.map((job) => services.redisService.markJobForStopping(job.id))
        );
        console.log(`[QueueService] ${activeJobs.length} active jobs marked for stopping`);
      }

      // Clean delayed jobs from queue
      await crawlQueue.clean(0, 0, "delayed");

      const removedCount = waitingJobs.length + delayedJobs.length;
      console.log(
        `[QueueService] Removed ${removedCount} waiting/delayed jobs; ${activeJobs.length} active jobs will complete naturally`
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
