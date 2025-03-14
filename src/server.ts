// server.ts
import fastify, { FastifyInstance } from "fastify";
import config from "./config/config";
import fastifyCookie from "@fastify/cookie";
import fastifyHelmet from "@fastify/helmet";
import socketPlugin from "./plugins/socketPlugin";
import { v4 as uuidv4 } from "uuid";
import sentryMonitoring from "./plugins/sentryMonitoringPlugin";

/**
 * Socket.io Server Application
 */
class SocketApplication {
  server: FastifyInstance;

  constructor() {
    this.server = fastify({
      logger: {
        level: "info",
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      },
      keepAliveTimeout: 60000,
      connectionTimeout: 60000,
      trustProxy: process.env.NODE_ENV === "production", // Important for AWS API Gateway
    });
  }

  /**
   * Start the Socket.io server on the configured port.
   */
  async startSocketServer() {
    try {
      console.log("config.server.port", config.server.port);
      const address = await this.server.listen({
        port: config.server.port as number,
        host: config.server.host || "0.0.0.0",
      });
      console.log(`Socket.io server listening at ${address}`);
    } catch (error) {
      this.server.log.error(error);
      process.exit(1);
    }
  }

  /**
   * Add a health check route (useful for API Gateway and load balancers)
   */
  addHealthCheck() {
    this.server.get("/health", async () => {
      return {
        status: "ok",
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || "development",
      };
    });
  }
  /**
   * Register Fastify plugins for Socket.io with necessary middleware.
   */
  registerPlugins() {
    this.server.register(sentryMonitoring);

    // Register Helmet for security
    this.server.register(fastifyHelmet);

    // Register Cookie plugin (needed for authentication)
    this.server.register(fastifyCookie, {
      parseOptions: {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
        maxAge: 60 * 60 * 24 * 7, // 1 week
      },
    });

    // Register the custom Socket.io plugin with enhanced request ID support
    this.server.register(socketPlugin);
  }

  /**
   * Main entry point for the application.
   */
  async main() {
    console.log(`NODE ENV IS ${process.env.NODE_ENV}`);
    this.registerPlugins();
    this.addHealthCheck();
    await this.startSocketServer();
  }
}

// Initialize and start the Socket.io application.
const socketApp = new SocketApplication();
socketApp.main();
