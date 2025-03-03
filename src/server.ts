import fastify, { FastifyInstance } from "fastify";
import config from "./config/config";
import auth from "./plugins/auth";
import corsConfig from "./config/corsConfig";
// Import CORS plugin for handling cross-origin requests
import cors from "@fastify/cors";
import fastifyCookie from "@fastify/cookie";
// Import Fastify Helmet (adds security headers to protect against attacks like XSS)
import fastifyHelmet from "@fastify/helmet";
import websocketPlugin from "@fastify/websocket";
import { websocketController } from "./controllers/websocketController";

class Application {
  server: FastifyInstance;
  constructor() {
    this.server = fastify({ logger: true });
  }
  async startHttpServer() {
    try {
      console.log("config.port", config.port);
      // Start the server on the specified port
      const address = await this.server.listen({ port: config.port });
      console.log(`Server listening at ${address}`);
    } catch (error) {
      this.server.log.error(error);
      process.exit(1);
    }
  }
  registerPlugins() {
    const env = (process.env.NODE_ENV as keyof typeof corsConfig) || "dev";
    // Register Helmet for security (adds important security-related headers)
    this.server.register(fastifyHelmet);

    // Register CORS middleware (allows the frontend to communicate with the backend)
    this.server.register(cors, corsConfig[env]);
    // Register the Cookie plugin (enables Fastify to read and set cookies)
    this.server.register(fastifyCookie, {
      parseOptions: {
        httpOnly: true, // Prevents JavaScript from accessing cookies (protects against XSS)
        secure: process.env.NODE_ENV === "production", // Enforces HTTPS for cookies in production
        sameSite: "strict", // Ensures cookies are only sent with same-site requests (prevents CSRF)
        path: "/", // Cookie is valid across the entire domain
        maxAge: 60 * 60 * 24 * 7, // Cookie expires in 1 week (reduces need for frequent logins)
      },
    });
    // Register authentication plugin (adds `server.authentication` to handle JWT verification)
    this.server.register(websocketPlugin);
    this.server.register(auth);
  }
  registerControllers() {
    this.server.register(websocketController);
  }
  async main() {
    console.log(`NODE ENV IS ${process.env.NODE_ENV}`);
    this.registerPlugins();
    this.registerControllers();
    await this.startHttpServer();
  }
}

const appInstance = new Application();
appInstance.main();
