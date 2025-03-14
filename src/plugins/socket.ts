// plugins/socket.ts
import { FastifyInstance } from "fastify";
import { Server as IOServer, Socket } from "socket.io";
import { socketAuthMiddleware } from "../middleware/socketAuth";
import config from "../config/config";

/**
 * Socket.io plugin for Fastify with authentication and request tracking.
 *
 * @param fastify - Fastify instance
 */
export default async function socketPlugin(fastify: FastifyInstance) {
  // Create a new Socket.io instance attached to Fastify's underlying HTTP server.
  const io = new IOServer(fastify.server, {
    cors: config.cors.production,
    // Important settings for AWS deployment
    // These can help with Lambda's connection handling
    connectTimeout: 45000,
    pingTimeout: 30000,
    pingInterval: 25000,
  });

  // Decorate Fastify with the Socket.io instance.
  fastify.decorate("io", io);

  // Apply authentication middleware
  io.use((socket, next) => socketAuthMiddleware(fastify, socket, next));

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
  // Register a hook to close all socket connections on server shutdown
  fastify.addHook("onClose", (instance, done) => {
    io.close();
    done();
  });
}
