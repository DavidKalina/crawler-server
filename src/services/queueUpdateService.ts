// services/queueUpdateService.ts
import { CrawlStats } from "../types/crawlTypes";
import { QueueJobInfo, QueueStats } from "../types/queueTypes";
import { DatabaseService } from "./databaseService";
import { QueueService } from "./queueService";
import { WebSocketService } from "./wsService";

export class QueueUpdateService {
  constructor(
    private wsService: WebSocketService,
    private queueService: QueueService,
    private dbService: DatabaseService
  ) {}

  async broadcastQueueUpdate(): Promise<void> {
    // Skip if no active connections
    if (this.wsService.activeConnections === 0) return;

    try {
      // Get all required data
      const [queueStats, dbJobs, queueJobs] = await Promise.all([
        this.queueService.getQueueStats(),
        this.dbService.getRecentJobs(10),
        this.queueService.getRecentJobs(),
      ]);

      // Process the jobs and create crawl stats
      const jobsByCrawlId = this.groupJobsByCrawlId(queueJobs);
      const crawlStats = this.processCrawlStats(dbJobs, jobsByCrawlId);

      // Broadcast the update
      this.wsService.broadcast({
        crawls: crawlStats,
        queueStats: this.formatQueueStats(queueStats),
      });
    } catch (error) {
      console.error("Failed to broadcast queue update:", error);
      // Optionally, we could broadcast an error message to clients
      this.broadcastError("Queue update failed");
    }
  }

  private groupJobsByCrawlId(jobs: QueueJobInfo[]): Map<string, QueueJobInfo[]> {
    const jobMap = new Map<string, QueueJobInfo[]>();

    for (const job of jobs) {
      const crawlId = job.data.id;
      if (!jobMap.has(crawlId)) {
        jobMap.set(crawlId, []);
      }
      jobMap.get(crawlId)?.push(job);
    }

    return jobMap;
  }

  private processCrawlStats(
    dbJobs: any[],
    jobsByCrawlId: Map<string, QueueJobInfo[]>
  ): CrawlStats[] {
    return dbJobs.map((dbJob) => {
      const queueJobs = jobsByCrawlId.get(dbJob.id) || [];

      // If no queue jobs exist yet, treat as pending
      if (queueJobs.length === 0) {
        return {
          crawlId: dbJob.id,
          stats: {
            total: 1,
            waiting: 0,
            active: 0,
            completed: 0,
            failed: 0,
            pending: 1,
          },
          isComplete: false,
          status: "pending",
        };
      }

      // Calculate stats from queue jobs
      const stats = {
        total: queueJobs.length,
        waiting: queueJobs.filter((j) => j.state === "waiting").length,
        active: queueJobs.filter((j) => j.state === "active").length,
        completed: queueJobs.filter((j) => j.state === "completed").length,
        failed: queueJobs.filter((j) => j.state === "failed").length,
        pending: 0,
      };

      return {
        crawlId: dbJob.id,
        stats,
        isComplete: queueJobs.every((j) => ["completed", "failed"].includes(j.state)),
        status: dbJob.status,
      };
    });
  }

  private formatQueueStats(stats: QueueStats): QueueStats {
    return {
      waitingCount: stats.waitingCount,
      activeCount: stats.activeCount,
      completedCount: stats.completedCount,
      failedCount: stats.failedCount,
    };
  }

  private broadcastError(message: string): void {
    this.wsService.broadcast({
      type: "error",
      message,
      timestamp: new Date().toISOString(),
    });
  }

  // Optional: Method to broadcast specific crawl updates
  async broadcastCrawlUpdate(crawlId: string): Promise<void> {
    if (this.wsService.activeConnections === 0) return;

    try {
      const [dbJob, queueJobs] = await Promise.all([
        this.dbService.getJobById(crawlId),
        this.queueService.getJobsByCrawlId(crawlId),
      ]);

      if (!dbJob) {
        throw new Error(`Crawl job ${crawlId} not found`);
      }

      const jobsByCrawlId = new Map([[crawlId, queueJobs]]);
      const crawlStats = this.processCrawlStats([dbJob], jobsByCrawlId);

      this.wsService.broadcast({
        type: "crawlUpdate",
        crawl: crawlStats[0],
      });
    } catch (error) {
      console.error(`Failed to broadcast crawl update for ${crawlId}:`, error);
      this.broadcastError(`Failed to update crawl ${crawlId}`);
    }
  }

  // Optional: Method to start automatic updates
  startPeriodicUpdates(intervalMs: number = 5000): NodeJS.Timer {
    return setInterval(() => {
      this.broadcastQueueUpdate().catch((error) => {
        console.error("Periodic update failed:", error);
      });
    }, intervalMs);
  }
}

// Types file (types/queueTypes.ts) for reference:
/*
export interface QueueJobInfo {
  id: string;
  state: string;
  data: any;
  progress: number | object;
}




*/
