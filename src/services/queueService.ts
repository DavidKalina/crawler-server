// services/queueService.ts
import { JobType } from "bullmq";
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
      // 1. Mark the crawl as stopping.
      await services.dbService.updateJobStatus(crawlId, "stopping", {
        stop_requested_at: new Date().toISOString(),
      });

      // 2. Clear any active job tracking (this is your Redis bookkeeping).
      await services.redisService.clearActiveJobs(crawlId);

      // 3. Retrieve all jobs for this crawl.
      const crawlJobs = await this.getJobsByCrawlId(crawlId);

      // 4. Filter out jobs that are still in waiting or delayed states.
      const jobsToRemove = crawlJobs.filter(
        (job) => job.state === "waiting" || job.state === "delayed"
      );

      await Promise.all(
        jobsToRemove.map(async (job) => {
          try {
            await this.removeJob(job.id);
          } catch (error) {
            console.error(`[QueueService] Error removing job ${job.id}:`, error);
          }
        })
      );

      console.log(
        `[QueueService] Removed ${jobsToRemove.length} waiting/delayed jobs; active jobs will complete naturally`
      );

      // 5. Optionally, if no active jobs remain, mark the crawl as stopped immediately.
      const activeJobs = crawlJobs.filter((job) => job.state === "active");
      if (activeJobs.length === 0) {
        await services.dbService.updateJobStatus(crawlId, "canceled", {
          completed_at: new Date().toISOString(),
        });
      }

      // 6. Clean up any delayed jobs in the queue.
      await crawlQueue.clean(0, 0, "delayed");
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
      const job = await crawlQueue.getJob(jobId);
      if (job) {
        // Force remove the job even if it's locked
        await job.remove({ force: true });
        console.log(`[QueueService] Successfully removed job ${jobId}`);
      } else {
        console.log(`[QueueService] Job ${jobId} not found`);
      }
    } catch (error) {
      console.error(`[QueueService] Error removing job ${jobId}:`, error);
      throw error;
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
