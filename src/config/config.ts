import * as dotenv from "dotenv";

dotenv.config();

export default {
  // Server configuration
  server: {
    port: process.env.PORT || 3000,
    host: process.env.HOST || "0.0.0.0",
  },
  // AWS configuration
  aws: {
    region: process.env.AWS_REGION || "us-east-1",
    cognito: {
      userPoolId: process.env.AWS_COGNITO_USER_POOL_ID,
      clientId: process.env.AWS_COGNITO_CLIENT_ID,
    },
    dynamodb: {
      endpoint: process.env.AWS_DYNAMODB_ENDPOINT, // For local development
      tableNames: {
        users: process.env.USERS_TABLE || "Users",
        messages: process.env.MESSAGES_TABLE || "Messages",
        // Add other tables as needed
      },
    },
    lambda: {
      functionName: process.env.LAMBDA_FUNCTION_NAME,
    },
  },

  // Authentication configuration
  auth: {
    cookieName: "authToken",
    jwksCacheTTL: parseInt(process.env.JWKS_CACHE_TTL || "86400000"), // 24 hours in milliseconds
  },

  // Logging configuration
  logging: {
    level: process.env.LOG_LEVEL || "info",
    prettyPrint: process.env.NODE_ENV !== "production",
  },
};