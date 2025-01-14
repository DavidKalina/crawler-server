import dotenv from "dotenv";
import express from "express";
import { createServer } from "http";
import type { WebSocket as WSClient } from "ws";
import { setupMiddleware } from "./middleware";
import { setupRoutes } from "./routes";
import "./workers/bullWorkers";
import { ServiceFactory } from "./services/serviceFactory";
import setupWebSocket from "./config/websocket";
import { wsService } from "./services/wsService"; // Import the singleton instance
console.log("Worker started and listening for jobs...");
dotenv.config();

export const app = express();
const server = createServer(app);
export const clients = new Set<WSClient>();

const cleanup = async () => {
  console.log("Server shutting down...");
  await ServiceFactory.cleanup();
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
};

setupMiddleware(app);
setupWebSocket(server, wsService);
setupRoutes(app);

process.on("SIGTERM", cleanup);
process.on("SIGINT", cleanup);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default server;
