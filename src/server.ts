import fastify, { FastifyInstance } from "fastify";
import config from "./config/config";
import auth from "./plugins/auth";
import corsConfig from "./config/corsConfig";
import cors from "@fastify/cors";
import fastifyCookie from "@fastify/cookie";
import fastifyHelmet from "@fastify/helmet";
import socketPlugin from "./plugins/socket";
import { v4 as uuidv4 } from "uuid"; // Add this import for UUID generation
/**
 * Main Application class to configure and start the Fastify server.
 */
class Application {
  server: FastifyInstance;

  constructor() {
    this.server = fastify({
      logger: {
        level: "info", // Adjust based on your needs
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
        // Add request ID to all logs
        serializers: {
          req: (request) => {
            return {
              id: request.id,
              method: request.method,
              url: request.url,
              // Add other relevant info but avoid sensitive data
              headers: {
                "x-request-id": request.headers["x-request-id"],
              },
            };
          },
        },
      },
      keepAliveTimeout: 60000, // Keep connections open for 60s
      connectionTimeout: 60000,
      // Generate request ID for each request
      genReqId: (request) => {
        // Use existing X-Request-ID from header if available, or generate a new one
        return (request.headers["x-request-id"] as string) || uuidv4();
      },
    });
  }

  /**
   * Start the HTTP server on the configured port.
   */
  async startHttpServer() {
    try {
      console.log("config.port", config.port);
      // Listen on the specified port.
      const address = await this.server.listen({ port: config.port });
      console.log(`Server listening at ${address}`);
    } catch (error) {
      this.server.log.error(error);
      process.exit(1);
    }
  }

  /**
   * Register Fastify plugins for security, CORS, cookies, authentication, and Socket.io.
   */
  registerPlugins() {
    // Determine environment-specific CORS settings.
    const env = (process.env.NODE_ENV as keyof typeof corsConfig) || "dev";

    // Register Helmet for security (adds important security-related headers).
    this.server.register(fastifyHelmet);

    // Register CORS middleware (allows the frontend to communicate with the backend).
    this.server.register(cors, corsConfig[env]);

    // Register Cookie plugin (enables Fastify to read and set cookies).
    this.server.register(fastifyCookie, {
      parseOptions: {
        httpOnly: true, // Prevents JavaScript from accessing cookies (protects against XSS).
        secure: process.env.NODE_ENV === "production", // Enforces HTTPS for cookies in production.
        sameSite: "strict", // Ensures cookies are only sent with same-site requests (prevents CSRF).
        path: "/", // Cookie is valid across the entire domain.
        maxAge: 60 * 60 * 24 * 7, // Cookie expires in 1 week.
      },
    });

    // Register custom authentication plugin (handles JWT verification, etc.).
    this.server.register(auth);

    // Register the custom Socket.io plugin.
    this.server.register(socketPlugin);
    // Add request tracing hooks
    this.registerRequestTracingHooks();
  }
  registerRequestTracingHooks() {
    // Add request tracking hook
    this.server.addHook("onRequest", (request, reply, done) => {
      // Set X-Request-ID header in the response
      reply.header("X-Request-ID", request.id);

      // Add request start time for calculating duration
      request.startTime = process.hrtime();

      // Log start of request
      request.log.info({
        event: "request_start",
        requestId: request.id,
        path: request.url,
        method: request.method,
      });

      done();
    });

    // Add response hook to log request completion with timing
    this.server.addHook("onResponse", (request, reply, done) => {
      // Calculate request duration
      const hrDuration = process.hrtime(request.startTime);
      const durationMs = hrDuration[0] * 1000 + hrDuration[1] / 1000000;

      // Log request completion
      request.log.info({
        event: "request_end",
        requestId: request.id,
        responseTime: durationMs.toFixed(2) + "ms",
        statusCode: reply.statusCode,
        path: request.url,
        method: request.method,
      });

      done();
    });

    // Add error handler
    this.server.setErrorHandler((error, request, reply) => {
      request.log.error({
        err: error,
        stack: error.stack,
        event: "request_error",
        requestId: request.id,
        path: request.url,
        method: request.method,
      });

      // Determine appropriate status code and message
      const statusCode = error.statusCode || 500;
      const message = error.message || "Internal Server Error";

      // Return standardized error response with request ID
      reply.code(statusCode).send({
        error: message,
        statusCode,
        requestId: request.id,
      });
    });
  }
  /**
   * Main entry point for the application.
   */
  async main() {
    console.log(`NODE ENV IS ${process.env.NODE_ENV}`);
    this.registerPlugins();
    await this.startHttpServer();
  }
}
// Extend Fastify request interface to include our added properties
declare module "fastify" {
  interface FastifyRequest {
    startTime?: [number, number]; // For tracking request duration
  }
}

// Initialize and start the Fastify application.
const appInstance = new Application();
appInstance.main();
