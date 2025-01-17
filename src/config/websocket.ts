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
      console.log("Received WebSocket upgrade request from:", request.headers.origin);

      // Validate origin
      if (!isValidOrigin(request.headers.origin)) {
        console.log("Invalid origin:", request.headers.origin);
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

    // Send an initial test message
    try {
      ws.send(JSON.stringify({ type: "connection_test", message: "Connected successfully" }));
      console.log("Sent test message to new client");
    } catch (error) {
      console.error("Error sending test message:", error);
    }

    setupWebSocketClient(ws, wsService);
    setupWebSocketHeartbeat(ws);
  });

  // Handle server errors
  wss.on("error", (error) => {
    console.error("WebSocket server error:", error);
  });

  return wss;
};

// Message handler function
const handleWebSocketMessage = (ws: WSClient, data: any) => {
  console.log("Handling WebSocket message:", data);

  switch (data.type) {
    case "client_test":
      console.log("Received test message from client:", data.message);
      ws.send(
        JSON.stringify({
          type: "server_response",
          message: "Server received your test message",
        })
      );
      break;

    case "ping":
      ws.send(
        JSON.stringify({
          type: "pong",
          timestamp: Date.now(),
        })
      );
      break;

    case "subscribe":
      // Handle subscription requests if needed
      console.log("Client requested subscription");
      break;

    case "unsubscribe":
      // Handle unsubscription requests if needed
      console.log("Client requested unsubscription");
      break;

    default:
      console.log("Unknown message type:", data.type);
      sendError(ws, "Unknown message type");
  }
};

// Setup individual client
const setupWebSocketClient = (ws: WSClient, wsService: WebSocketService) => {
  // Add client to service
  wsService.addClient(ws);

  // Handle incoming messages
  ws.on("message", (message: Buffer) => {
    try {
      console.log("Received message from client:", message.toString());
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
  }, 30000);

  ws.on("pong", () => {
    console.log("Received pong from client");
  });

  ws.on("close", () => {
    clearInterval(interval);
  });
};

const isValidOrigin = (origin: string): boolean => {
  const allowedOrigins = [
    "http://localhost:5000",
    "http://localhost:3000",
    // Add other allowed origins
  ];
  return allowedOrigins.includes(origin);
};

const sendError = (ws: WSClient, message: string) => {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify({ type: "error", message }));
  }
};

export default setupWebSocket;
