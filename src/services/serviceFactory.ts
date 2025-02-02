// services/factory.ts
import { supabase } from "../lib/supabaseClient";
import { crawlQueue } from "../queues/crawlQueue";
import { DatabaseService } from "./databaseService";
import { HealthService } from "./healthService";
import { queueService, QueueService } from "./queueService";
import { RedisService } from "./redisService";
import { wsService } from "./wsService";

export interface Services {
  wsService: typeof wsService;
  queueService: QueueService;
  dbService: DatabaseService;
  healthService: HealthService;
  redisService: RedisService;
}

export class ServiceFactory {
  private static instance: ServiceFactory | null = null;
  private services: Services | null = null;

  private constructor() {
    console.log("ServiceFactory: Initializing singleton instance");
  }

  public static getInstance(): ServiceFactory {
    if (!ServiceFactory.instance) {
      console.log("ServiceFactory: Creating new singleton instance");
      ServiceFactory.instance = new ServiceFactory();
    }
    return ServiceFactory.instance;
  }

  public getServices(): Services {
    if (!this.services) {
      console.log("ServiceFactory: Creating services");
      const dbService = new DatabaseService(supabase);
      const redisService = new RedisService();
      const healthService = new HealthService(crawlQueue, supabase);

      this.services = {
        wsService,
        queueService,
        dbService,
        healthService,
        redisService,
      };
    }
    return this.services;
  }

  public async cleanup(): Promise<void> {
    if (this.services) {
      console.log("ServiceFactory: Cleaning up services");
      this.services.wsService.wsClients.forEach((client) => {
        client.close();
      });
      this.services = null;
    }
  }

  public reset(): void {
    console.log("ServiceFactory: Resetting services");
    this.services = null;
  }
}

// Export a singleton instance
export const serviceFactory = ServiceFactory.getInstance();
