// src/queues/crawlQueue.ts
import { Queue } from "bullmq";
import dotenv from "dotenv";
import { BULL_REDIS_CONFIG } from "../config/redis";

dotenv.config();

export const crawlQueue = new Queue("crawl-jobs", BULL_REDIS_CONFIG);

// Add error handling
crawlQueue.on("error", (error) => {
  console.error("Queue error:", error);
});
