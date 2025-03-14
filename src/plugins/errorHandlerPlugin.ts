// src/plugins/socket-error-handler.ts

import { FastifyInstance, FastifyPluginCallback } from "fastify";
import { fastifyPlugin } from "fastify-plugin";
import { Server, Socket } from "socket.io";
import { AppError } from "../utils/errorHandler";

/**
 * Custom Fastify plugin to handle Socket.IO errors, including:
 * - Centralized error handling with logging
 * - Socket connection tracking and monitoring
 * - Socket event error handling
 * - Request tracking for logging and debugging
 */
const socketErrorHandlerPlugin: FastifyPluginCallback = (
  fastify: FastifyInstance,
  options,
  done
) => {
  // Ensure Socket.IO instance is available
  if (!fastify.io) {
    fastify.log.error("Socket.IO instance not found on Fastify server");
    return done(new Error("Socket.IO instance not available"));
  }

  const io: Server = fastify.io;

  // 1️⃣ Socket connection error handling
  io.on("connection", (socket: Socket) => {
    const socketId = socket.id;

    // Log new socket connections
    fastify.log.info({
      event: "socket_connected",
      socketId,
      requestId: (socket as any).requestId,
      transport: socket.conn.transport.name,
      address: socket.handshake.address,
      userAgent: socket.handshake.headers["user-agent"],
      timestamp: new Date().toISOString(),
    });

    // 2️⃣ Handle socket errors
    socket.on("error", (error) => {
      // Log socket-specific errors
      fastify.log.error({
        err: error,
        stack: error.stack,
        event: "socket_error",
        socketId,
        requestId: (socket as any).requestId,
        timestamp: new Date().toISOString(),
      });

      // Emit error back to client with normalized structure
      // Use "app:error" instead of "error" to avoid conflicts with Socket.IO's reserved events
      socket.emit("app:error", {
        message:
          error instanceof AppError ? error.message : "Internal server error",
        errorCode: error instanceof AppError ? error.errorCode : "SOCKET_ERROR",
        status: error instanceof AppError ? error.statusCode : 500,
        socketId,
        requestId: (socket as any).requestId,
      });
    });

    // 3️⃣ Handle disconnection
    socket.on("disconnect", (reason) => {
      fastify.log.info({
        event: "socket_disconnected",
        socketId,
        requestId: (socket as any).requestId,
        reason,
        timestamp: new Date().toISOString(),
      });
    });

    // 4️⃣ Handle reconnection attempts
    socket.on("reconnect_attempt", (attemptNumber) => {
      fastify.log.info({
        event: "socket_reconnect_attempt",
        socketId,
        requestId: (socket as any).requestId,
        attemptNumber,
        timestamp: new Date().toISOString(),
      });
    });
  });

  // 5️⃣ Global Socket.IO error handler
  io.engine.on("connection_error", (err) => {
    // Don't attempt to map to Cognito errors, just log the raw connection error
    fastify.log.error({
      err,
      event: "socket_connection_error",
      timestamp: new Date().toISOString(),
      requestId: err?.req?.requestId,
    });
  });

  // 6️⃣ Add middleware to track event performance
  io.use((socket, next) => {
    // Create a middleware to track socket event performance
    socket.onAny((event, ...args) => {
      const startTime = process.hrtime();

      // Log event start
      fastify.log.debug({
        event: "socket_event_start",
        socketId: socket.id,
        requestId: (socket as any).requestId,
        socketEvent: event,
        timestamp: new Date().toISOString(),
      });

      // Create a wrapper to track the end of event handlers
      const eventEndHandler = () => {
        const hrDuration = process.hrtime(startTime);
        const durationMs = hrDuration[0] * 1000 + hrDuration[1] / 1000000;

        fastify.log.debug({
          event: "socket_event_end",
          socketId: socket.id,
          requestId: (socket as any).requestId,
          socketEvent: event,
          responseTime: durationMs.toFixed(2) + "ms",
          timestamp: new Date().toISOString(),
        });
      };

      // For async handlers we can't easily track when they complete
      // This is a best-effort approach
      setTimeout(eventEndHandler, 0);
    });

    next();
  });

  // 7️⃣ Lambda-specific optimizations
  if (process.env.AWS_LAMBDA_FUNCTION_NAME) {
    // Log warm starts vs cold starts
    const isWarmStart = !!process.env.LAMBDA_TASK_ROOT;
    fastify.log.info({
      event: isWarmStart ? "lambda_warm_start" : "lambda_cold_start",
      timestamp: new Date().toISOString(),
    });
  }

  // 8️⃣ Add custom error event for application errors (for internal event emission)
  fastify.decorate("socketError", (socket: Socket, error: Error | AppError) => {
    // Log error details
    fastify.log.error({
      err: error,
      stack: error.stack,
      event: "socket_app_error",
      socketId: socket.id,
      requestId: (socket as any).requestId,
      timestamp: new Date().toISOString(),
    });

    // Send standardized error response
    socket.emit("app_error", {
      message:
        error instanceof AppError ? error.message : "Internal server error",
      errorCode: error instanceof AppError ? error.errorCode : "INTERNAL_ERROR",
      status: error instanceof AppError ? error.statusCode : 500,
      socketId: socket.id,
      requestId: (socket as any).requestId,
      timestamp: new Date().toISOString(),
    });
  });

  done();
};

// Export the Fastify plugin so it can be used in the main application
export default fastifyPlugin(socketErrorHandlerPlugin, {
  name: "socketErrorHandler",
  dependencies: ["fastify-socket.io"],
});
