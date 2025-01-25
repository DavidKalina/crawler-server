// services/queueService.ts
import { Queue, JobType } from "bullmq";
import { CrawlJob } from "../types/crawlTypes";
import { QueueJobInfo, QueueStats } from "../types/queueTypes";

export class QueueService {
  constructor(private queue: Queue) {}

  async getQueueStats(): Promise<QueueStats> {
    return {
      waitingCount: await this.queue.getWaitingCount(),
      activeCount: await this.queue.getActiveCount(),
      completedCount: await this.queue.getCompletedCount(),
      failedCount: await this.queue.getFailedCount(),
    };
  }

  async addJob(data: CrawlJob) {
    return this.queue.add("crawl-jobs", data);
  }

  async getRecentJobs(limit: number = 10): Promise<QueueJobInfo[]> {
    // Get jobs from all relevant states
    const jobStates: JobType[] = ["waiting", "active", "completed", "failed"];
    const jobs = await this.queue.getJobs(jobStates, 0, limit);

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
    const jobs = await this.queue.getJobs(jobStates);

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
      const job = await this.queue.getJob(jobId);
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
    const jobs = await this.queue.getJobs(jobStates);

    await Promise.all(jobs.map((job) => job.remove()));
    return jobs.length;
  }

  async getJobState(jobId: string): Promise<string | null> {
    const job = await this.queue.getJob(jobId);
    if (!job) return null;
    return job.getState();
  }
}
