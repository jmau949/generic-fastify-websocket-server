import { FastifyInstance, FastifyRequest } from "fastify";
import WebSocket from "ws";
import { validateToken } from "../plugins/auth"; // Import JWT validation function

/**
 * WebSocket Controller with Authentication
 *
 * - Registers a WebSocket endpoint at `/ws`
 * - Verifies JWT token before allowing connections
 * - Manages connected clients in a Set
 * - Supports broadcasting messages to all clients
 *
 * @param fastify - The Fastify server instance
 */
export async function websocketController(fastify: FastifyInstance) {
  const clients = new Set<WebSocket>(); // Track active WebSocket connections

  // WebSocket route at `/ws`
  fastify.get(
    "/ws",
    { websocket: true },
    async (socket: WebSocket, req: FastifyRequest) => {
      try {
        // Extract JWT token from query string (e.g., ws://localhost:3020/ws?token=xxx)
        const token = req.cookies.authToken;

        if (!token) {
          fastify.log.warn("Missing authentication token. Closing WebSocket.");
          socket.close(1008, "Missing authentication token");
          return;
        }

        // ✅Validate the JWT token
        const user = await validateToken(token);
        if (!user) {
          fastify.log.warn("Invalid authentication token. Closing WebSocket.");
          socket.close(1008, "Invalid authentication token");
          return;
        }

        //  Add client to active connections
        clients.add(socket);
        fastify.log.info(
          `WebSocket connected: User ${user.sub}. Total clients: ${clients.size}`
        );

        //  Handle incoming messages
        socket.on("message", (message: WebSocket.RawData) => {
          try {
            const messageText =
              typeof message === "string" ? message : message.toString();
            fastify.log.info(`Received from ${user.sub}: ${messageText}`);

            //  Broadcast message to all connected clients
            for (const client of clients) {
              if (client.readyState === WebSocket.OPEN) {
                client.send(
                  JSON.stringify({ user: user.sub, message: messageText })
                );
              }
            }
          } catch (error) {
            fastify.log.error(`Error processing message: ${error}`);
          }
        });

        //  Handle WebSocket disconnection
        socket.on("close", () => {
          clients.delete(socket);
          fastify.log.info(
            `WebSocket disconnected: User ${user.sub}. Total clients: ${clients.size}`
          );
        });

        //  Handle WebSocket errors
        socket.on("error", (error: Error) => {
          fastify.log.error(
            `WebSocket error for ${user.sub}: ${error.message}`
          );
          socket.close();
        });
      } catch (error) {
        fastify.log.error("WebSocket authentication failed:", error);
        socket.close(1008, "Authentication failed");
      }
    }
  );
}
