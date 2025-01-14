// services/wsService.ts
import { WebSocket as WSClient } from "ws";

export class WebSocketService {
  private clients: Set<WSClient>;
  private static instance: WebSocketService;

  private constructor() {
    this.clients = new Set();
  }

  // Singleton pattern to ensure we're using the same instance
  public static getInstance(): WebSocketService {
    if (!WebSocketService.instance) {
      WebSocketService.instance = new WebSocketService();
    }
    return WebSocketService.instance;
  }

  addClient(client: WSClient) {
    this.clients.add(client);
    console.log(`Client added. Total clients: ${this.clients.size}`);

    // Send a test message to verify the connection
    this.sendToClient(client, {
      type: "welcome",
      message: "Connected to WebSocket server",
      clientCount: this.clients.size,
    });
  }

  removeClient(client: WSClient) {
    this.clients.delete(client);
    console.log(`Client removed. Total clients: ${this.clients.size}`);
  }

  broadcast(message: any) {
    const serializedMessage = JSON.stringify(message);
    console.log(`Broadcasting message to ${this.clients.size} clients:`, message);

    let successCount = 0;
    this.clients.forEach((client) => {
      if (client.readyState === client.OPEN) {
        try {
          client.send(serializedMessage);
          successCount++;
        } catch (error) {
          console.error("Failed to send message to client:", error);
          this.removeClient(client);
        }
      } else {
        console.log(`Client in invalid state: ${client.readyState}`);
        this.removeClient(client);
      }
    });

    console.log(`Successfully sent message to ${successCount} of ${this.clients.size} clients`);
  }

  private sendToClient(client: WSClient, message: any) {
    if (client.readyState === client.OPEN) {
      try {
        client.send(JSON.stringify(message));
        console.log("Successfully sent message to client");
      } catch (error) {
        console.error("Error sending message to client:", error);
      }
    }
  }

  get activeConnections() {
    return this.clients.size;
  }

  get wsClients() {
    return this.clients;
  }
}

// Export a singleton instance
export const wsService = WebSocketService.getInstance();
