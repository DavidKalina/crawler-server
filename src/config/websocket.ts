// config/websocket.ts
import { Server } from "http";
import { WebSocketServer, WebSocket as WSClient } from "ws";
import { WebSocketService } from "../services/wsService";
import { IncomingMessage } from "http";

interface WebSocketAuthRequest extends IncomingMessage {
  headers: {
    origin: string;
    authorization?: string;
  };
}

export const setupWebSocket = (server: Server, wsService: WebSocketService) => {
  const wss = new WebSocketServer({ noServer: true });

  // Handle upgrade requests
  server.on("upgrade", (request: WebSocketAuthRequest, socket, head) => {
    try {
      // Validate origin
      if (!isValidOrigin(request.headers.origin)) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }

      // Optional: Check authorization header if needed
      if (!isValidAuth(request.headers.authorization)) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }

      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    } catch (error) {
      console.error("WebSocket upgrade error:", error);
      socket.destroy();
    }
  });

  // Handle connections
  wss.on("connection", (ws: WSClient, request: WebSocketAuthRequest) => {
    console.log(`New WebSocket connection from ${request.headers.origin}`);

    setupWebSocketClient(ws, wsService);
    setupWebSocketHeartbeat(ws);
  });

  // Handle server errors
  wss.on("error", (error) => {
    console.error("WebSocket server error:", error);
  });

  return wss;
};

// Setup individual client
const setupWebSocketClient = (ws: WSClient, wsService: WebSocketService) => {
  // Add client to service
  wsService.addClient(ws);

  // Handle incoming messages
  ws.on("message", (message: Buffer) => {
    try {
      const data = JSON.parse(message.toString());
      handleWebSocketMessage(ws, data);
    } catch (error) {
      console.error("Error handling WebSocket message:", error);
      sendError(ws, "Invalid message format");
    }
  });

  // Handle client disconnection
  ws.on("close", () => {
    console.log("Client disconnected");
    wsService.removeClient(ws);
  });

  // Handle errors
  ws.on("error", (error) => {
    console.error("WebSocket client error:", error);
    wsService.removeClient(ws);
  });
};

// Setup heartbeat to keep connection alive
const setupWebSocketHeartbeat = (ws: WSClient) => {
  const interval = setInterval(() => {
    if (ws.readyState === ws.OPEN) {
      ws.ping();
    }
  }, 30000); // Send ping every 30 seconds

  ws.on("pong", () => {
    // Optional: Log or monitor latency
  });

  ws.on("close", () => {
    clearInterval(interval);
  });
};

// Message handler
const handleWebSocketMessage = (ws: WSClient, data: any) => {
  switch (data.type) {
    case "ping":
      ws.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
      break;
    case "subscribe":
      // Handle subscription requests
      break;
    case "unsubscribe":
      // Handle unsubscription requests
      break;
    default:
      sendError(ws, "Unknown message type");
  }
};

// Utility functions
const isValidOrigin = (origin: string): boolean => {
  const allowedOrigins = [
    "http://localhost:5000",
    // Add other allowed origins
  ];
  return allowedOrigins.includes(origin);
};

const isValidAuth = (auth?: string): boolean => {
  // Implement your authentication logic here
  // For now, return true if no auth is required
  return true;
};

const sendError = (ws: WSClient, message: string) => {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify({ type: "error", message }));
  }
};

export default setupWebSocket;
