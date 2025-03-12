import { FastifyInstance } from "fastify";
import { Server as IOServer, Socket } from "socket.io";
import { validateToken } from "../plugins/auth"; // Import JWT validation function

/**
 * Custom Socket.io plugin for Fastify with JWT authentication.
 *
 * This plugin integrates Socket.io with Fastify, adding token validation on connection.
 *
 * @param fastify - Fastify instance
 */
export default async function socketPlugin(fastify: FastifyInstance) {
  // Create a new Socket.io instance attached to Fastify's underlying HTTP server.
  const io = new IOServer(fastify.server, {
    cors: {
      origin: "http://localhost:5173", // For production, restrict this to allowed origins.
      methods: ["GET", "POST"],
      credentials: true, // Allow credentials (cookies, authorization headers, etc.)
    },
  });

  // Optionally, decorate Fastify with the Socket.io instance.
  fastify.decorate("io", io);

  // Middleware for authentication
  io.use(async (socket: Socket, next) => {
    try {
      // Extract the request ID from headers
      const requestId =
        socket.handshake.headers["x-request-id"] || "no-request-id";

      // Extract the token from the cookie header
      const cookieHeader = socket.handshake.headers.cookie;

      // Add requestId to log context
      const log = fastify.log.child({ requestId, socketId: socket.id });

      log.info("Socket authentication attempt");

      if (!cookieHeader) {
        log.warn("Missing authentication token");
        return next(new Error("Missing authentication token"));
      }

      // Parse cookies manually (basic method)
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

      // Attach user and requestId to socket instance
      (socket as any).user = user;
      (socket as any).requestId = requestId;

      log.info(`User ${user.sub} authenticated successfully`);
      next();
    } catch (error) {
      const requestId =
        socket.handshake.headers["x-request-id"] || "no-request-id";
      fastify.log.error(
        { requestId, socketId: socket.id, error: error.message },
        "Socket authentication failed"
      );
      next(new Error("Authentication failed"));
    }
  });

  io.on("connection", (socket) => {
    const user = (socket as any).user;
    const requestId = (socket as any).requestId || "no-request-id";

    // Create a logger with socket context
    const log = fastify.log.child({
      requestId,
      socketId: socket.id,
      userId: user.sub,
    });

    log.info("Socket connected");

    // Listen for a custom event sent by the client.
    socket.on("customEvent", (data) => {
      log.info({ data }, "Received customEvent");

      // Emit a response back to the same socket.
      socket.emit("customResponse", {
        message: "Hello from Fastify and Socket.io!",
      });
    });

    // Handle socket disconnection.
    socket.on("disconnect", () => {
      log.info("Socket disconnected");
    });
  });
}