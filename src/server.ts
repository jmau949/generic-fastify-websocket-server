import fastify, { FastifyInstance } from "fastify";
import config from "./config/config";
import auth from "./plugins/auth";
import corsConfig from "./config/corsConfig";
import cors from "@fastify/cors";
import fastifyCookie from "@fastify/cookie";
import fastifyHelmet from "@fastify/helmet";
import socketPlugin from "./plugins/socket";

/**
 * Main Application class to configure and start the Fastify server.
 */
class Application {
  server: FastifyInstance;

  constructor() {
    // Create a new Fastify instance with logging enabled.
    this.server = fastify({ logger: true });
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

// Initialize and start the Fastify application.
const appInstance = new Application();
appInstance.main();
