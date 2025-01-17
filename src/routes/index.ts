// routes/index.ts
import { Application } from "express";
import { crawlRouter } from "./crawlRoutes";
import { queueRouter } from "./queueRoutes";
import { healthRouter } from "./healthRoutes";

export const setupRoutes = (app: Application) => {
  app.use("/api/crawl", crawlRouter);
  app.use("/api/queue", queueRouter);
  app.use("/api/health", healthRouter);
};
