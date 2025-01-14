// services/factory.ts
import { supabase } from "../lib/supabaseClient";
import { crawlQueue } from "../queues/crawlQueue";
import { DatabaseService } from "./databaseService";
import { QueueService } from "./queueService";
import { QueueUpdateService } from "./queueUpdateService";
import { wsService } from "./wsService"; // Import the singleton instance
import { HealthService } from "./healthService";
import { RedisService } from "./redisService";

export interface Services {
  wsService: typeof wsService;
  queueService: QueueService;
  dbService: DatabaseService;
  queueUpdateService: QueueUpdateService;
  healthService: HealthService;
  redisService: RedisService;
}

export class ServiceFactory {
  private static instance: Services | null = null;

  static createServices(): Services {
    if (this.instance) {
      return this.instance;
    }

    const queueService = new QueueService(crawlQueue);
    const dbService = new DatabaseService(supabase);
    const redisService = new RedisService();
    const queueUpdateService = new QueueUpdateService(wsService, queueService, dbService);
    const healthService = new HealthService(crawlQueue, supabase);

    this.instance = {
      wsService, // Use the singleton instance
      queueService,
      dbService,
      queueUpdateService,
      healthService,
      redisService,
    };

    return this.instance;
  }

  static getServices(): Services {
    if (!this.instance) {
      return this.createServices();
    }
    return this.instance;
  }

  static resetServices(): void {
    this.instance = null;
  }

  static async cleanup(): Promise<void> {
    if (this.instance) {
      this.instance.wsService.wsClients.forEach((client) => {
        client.close();
      }); // Any other cleanup needed
      this.instance = null;
    }
  }
}
