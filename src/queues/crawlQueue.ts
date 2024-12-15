// src/queues/crawlQueue.ts
import { Queue } from "bullmq";
import dotenv from "dotenv";

dotenv.config();

export const crawlQueue = new Queue("crawl-jobs", {
  connection: {
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT || "6379"),
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
  },
});

// Add error handling
crawlQueue.on("error", (error) => {
  console.error("Queue error:", error);
});
