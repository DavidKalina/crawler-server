// services/redisService.ts
import { Redis } from "ioredis";
import { REDIS_CONFIG } from "../config/redis";

export class RedisService {
  private redis: Redis;

  constructor() {
    this.redis = new Redis(REDIS_CONFIG);
  }

  private getUrlSetKey(crawlId: string): string {
    return `crawl:${crawlId}:urls`;
  }

  private getActiveJobsKey(crawlId: string): string {
    return `crawl:${crawlId}:active_jobs`;
  }

  // URL tracking methods
  async isUrlProcessed(crawlId: string, url: string): Promise<boolean> {
    const key = this.getUrlSetKey(crawlId);
    const result = (await this.redis.sismember(key, url)) === 1;
    // console.log(`Checking if URL is processed: ${url}, Result: ${result}`);
    return result;
  }

  async addProcessedUrl(crawlId: string, url: string): Promise<void> {
    const key = this.getUrlSetKey(crawlId);
    // console.log(`Adding URL to Redis processed set: ${url}`);
    await this.redis.sadd(key, url);
  }

  async getProcessedUrlCount(crawlId: string): Promise<number> {
    const key = this.getUrlSetKey(crawlId);
    return await this.redis.scard(key);
  }

  async clearActiveJobs(crawlId: string): Promise<void> {
    const key = this.getActiveJobsKey(crawlId);
    // console.log(`[RedisService] Clearing active jobs for crawl ${crawlId}`);

    // Get current active jobs for logging
    const activeJobs = await this.getActiveJobs(crawlId);
    // console.log(`[RedisService] Found ${Object.keys(activeJobs).length} active jobs to clear`);

    // Delete the active jobs hash
    await this.redis.del(key);
    // console.log(`[RedisService] Cleared active jobs for crawl ${crawlId}`);
  }

  async addProcessedUrls(crawlId: string, urls: string[]): Promise<void> {
    if (urls.length === 0) return;

    const key = this.getUrlSetKey(crawlId);
    await this.redis.sadd(key, ...urls);
  }

  async areUrlsProcessed(crawlId: string, urls: string[]): Promise<boolean[]> {
    const key = this.getUrlSetKey(crawlId);
    const pipeline = this.redis.pipeline();

    // console.log(`[Debug] Checking ${urls.length} URLs in Redis set ${key}`);

    urls.forEach((url) => {
      pipeline.sismember(key, url);
    });

    const results = await pipeline.exec();
    const processed = results!.map(([err, result]) => result === 1);

    // console.log(`[Debug] Found ${processed.filter(Boolean).length} already processed URLs`);

    return processed;
  }

  // Job tracking methods
  async addActiveJob(
    crawlId: string,
    jobId: string,
    metadata: Record<string, any> = {}
  ): Promise<void> {
    const key = this.getActiveJobsKey(crawlId);
    await this.redis.hset(
      key,
      jobId,
      JSON.stringify({
        addedAt: new Date().toISOString(),
        ...metadata,
      })
    );
  }

  async removeActiveJob(crawlId: string, jobId: string): Promise<void> {
    const key = this.getActiveJobsKey(crawlId);
    await this.redis.hdel(key, jobId);
  }

  async getActiveJobCount(crawlId: string): Promise<number> {
    const key = this.getActiveJobsKey(crawlId);
    return await this.redis.hlen(key);
  }

  async getActiveJobs(crawlId: string): Promise<{ [jobId: string]: any }> {
    const key = this.getActiveJobsKey(crawlId);
    const jobs = await this.redis.hgetall(key);

    // Parse the JSON values
    return Object.fromEntries(
      Object.entries(jobs).map(([jobId, value]) => [jobId, JSON.parse(value)])
    );
  }

  // Cleanup methods
  async cleanup(crawlId: string): Promise<void> {
    const keys = [this.getUrlSetKey(crawlId), this.getActiveJobsKey(crawlId)];

    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }

  // Optional: Set expiry on keys to prevent memory leaks
  async setKeyExpiry(crawlId: string, expirySeconds: number = 86400): Promise<void> {
    const keys = [this.getUrlSetKey(crawlId), this.getActiveJobsKey(crawlId)];

    const pipeline = this.redis.pipeline();
    keys.forEach((key) => {
      pipeline.expire(key, expirySeconds);
    });

    await pipeline.exec();
  }

  async markJobForStopping(jobId: string): Promise<void> {
    const key = `job:${jobId}:stopping`;
    await this.redis.set(key, "1");
    // Optional: Set an expiry to clean up automatically
    await this.redis.expire(key, 60 * 60); // 1 hour expiry
  }

  async isJobMarkedForStopping(jobId: string): Promise<boolean> {
    const key = `job:${jobId}:stopping`;
    const value = await this.redis.get(key);
    return value === "1";
  }

  // Helper method to check if a crawl is active
  async isCrawlActive(crawlId: string): Promise<boolean> {
    const key = this.getActiveJobsKey(crawlId);
    return (await this.redis.exists(key)) === 1;
  }

  // Atomic job count operations
  async incrementActiveJobCount(crawlId: string): Promise<number> {
    const key = this.getActiveJobsKey(crawlId);
    return await this.redis.hlen(key);
  }

  async decrementActiveJobCount(crawlId: string): Promise<number> {
    const key = this.getActiveJobsKey(crawlId);
    return await this.redis.hlen(key);
  }
}
