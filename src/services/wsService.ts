// services/wsService.ts
import { WebSocket as WSClient } from "ws";

export class WebSocketService {
  private clients: Set<WSClient>;

  constructor() {
    this.clients = new Set();
  }

  addClient(client: WSClient) {
    this.clients.add(client);
  }

  removeClient(client: WSClient) {
    this.clients.delete(client);
  }

  broadcast(message: any) {
    const serializedMessage = JSON.stringify(message);
    this.clients.forEach((client) => {
      if (client.readyState === client.OPEN) {
        client.send(serializedMessage);
      }
    });
  }

  get activeConnections() {
    return this.clients.size;
  }

  get wsClients() {
    return this.clients;
  }
}

// Create singleton instance
export const wsService = new WebSocketService();
