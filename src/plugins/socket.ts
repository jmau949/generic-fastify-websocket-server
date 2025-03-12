// plugins/socket.ts
import { FastifyInstance } from "fastify";
import { Server as IOServer, Socket } from "socket.io";
import { validateToken } from "../plugins/auth";
import { v4 as uuidv4 } from "uuid";

/**
 * Custom Socket.io plugin for Fastify with JWT authentication and request tracking.
 *
 * @param fastify - Fastify instance
 */
export default async function socketPlugin(fastify: FastifyInstance) {
  // Create a new Socket.io instance attached to Fastify's underlying HTTP server.
  const io = new IOServer(fastify.server, {
    cors: {
      origin: "http://localhost:5173",
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  // Decorate Fastify with the Socket.io instance.
  fastify.decorate("io", io);

  // Middleware for request ID generation and authentication
  io.use(async (socket: Socket, next) => {
    try {
      // Get request ID from headers or generate a new one
      const requestId =
        (socket.handshake.headers["x-request-id"] as string) || uuidv4();

      // Store requestId on socket for later use
      (socket as any).requestId = requestId;

      // Create a logger with the request ID
      const log = fastify.log.child({
        requestId,
        socketId: socket.id,
        event: "socket_auth_attempt",
      });

      // Extract the token from the cookie header
      const cookieHeader = socket.handshake.headers.cookie;

      if (!cookieHeader) {
        log.warn("Missing authentication token");
        return next(new Error("Missing authentication token"));
      }

      // Parse cookies manually
      const cookies = Object.fromEntries(
        cookieHeader.split("; ").map((c) => c.split("="))
      );
      const token = cookies.authToken;

      if (!token) {
        log.warn("Missing authToken cookie");
        return next(new Error("Missing authentication token"));
      }

      // Validate JWT token
      const user = await validateToken(token);
      if (!user) {
        log.warn("Invalid authentication token");
        return next(new Error("Invalid authentication token"));
      }

      // Attach user to socket instance
      (socket as any).user = user;

      log.info({ userId: user.sub }, "Socket authenticated successfully");
      next();
    } catch (error) {
      const requestId =
        (socket as any).requestId ||
        (socket.handshake.headers["x-request-id"] as string) ||
        "unknown";

      fastify.log.error(
        {
          requestId,
          socketId: socket.id,
          error: error.message,
          event: "socket_auth_error",
        },
        "Socket authentication failed"
      );

      next(new Error("Authentication failed"));
    }
  });

  io.on("connection", (socket) => {
    const user = (socket as any).user;
    const requestId = (socket as any).requestId;

    // Create a logger with socket context
    const log = fastify.log.child({
      requestId,
      socketId: socket.id,
      userId: user.sub,
      event: "socket_activity",
    });

    log.info("Socket connected");

    // Listen for a custom event sent by the client.
    socket.on("customEvent", (data) => {
      log.info({ data }, "Received customEvent");

      // Emit a response back to the same socket.
      socket.emit("customResponse", {
        message: "Hello from Socket.io!!!!!!!",
        requestId, // Echo back the requestId for client correlation
      });
    });

    // Handle socket disconnection.
    socket.on("disconnect", () => {
      log.info("Socket disconnected");
    });

    // Handle errors
    socket.on("error", (error) => {
      log.error({ error: error.message }, "Socket error");
    });
  });
}
