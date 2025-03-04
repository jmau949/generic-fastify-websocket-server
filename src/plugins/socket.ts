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
      // Extract the token from the cookie header
      const cookieHeader = socket.handshake.headers.cookie;
      console.log(cookieHeader);
      if (!cookieHeader) {
        fastify.log.warn(`Socket ${socket.id} missing authentication token.`);
        return next(new Error("Missing authentication token"));
      }

      // Parse cookies manually (basic method)
      const cookies = Object.fromEntries(
        cookieHeader.split("; ").map((c) => c.split("="))
      );
      const token = cookies.authToken;

      if (!token) {
        fastify.log.warn(`Socket ${socket.id} missing authToken cookie.`);
        return next(new Error("Missing authentication token"));
      }

      // Validate JWT token
      const user = await validateToken(token);
      if (!user) {
        fastify.log.warn(`Socket ${socket.id} provided an invalid token.`);
        return next(new Error("Invalid authentication token"));
      }

      // Attach user to socket instance
      (socket as any).user = user;
      fastify.log.info(`Socket authenticated: User ${user.sub}`);
      next();
    } catch (error) {
      fastify.log.error(`Socket authentication failed: ${error.message}`);
      next(new Error("Authentication failed"));
    }
  });

  io.on("connection", (socket) => {
    const user = (socket as any).user;
    fastify.log.info(`Socket connected: ${socket.id}, User: ${user.sub}`);

    // Listen for a custom event sent by the client.
    socket.on("customEvent", (data) => {
      fastify.log.info(
        `Received customEvent from ${user.sub} (${socket.id}): ${JSON.stringify(
          data
        )}`
      );
      // Emit a response back to the same socket.
      socket.emit("customResponse", {
        message: "Hello from Fastify and Socket.io!",
      });
    });

    // Handle socket disconnection.
    socket.on("disconnect", () => {
      fastify.log.info(`Socket disconnected: ${socket.id}, User: ${user.sub}`);
    });
  });
}
