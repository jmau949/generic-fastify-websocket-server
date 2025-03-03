import { fastifyPlugin } from "fastify-plugin";
import { FastifyPluginCallback, FastifyReply, FastifyRequest } from "fastify";
import axios from "axios";
import * as jwt from "jsonwebtoken";
const jwkToPem = require("jwk-to-pem"); // Converts AWS Cognito JWK to PEM format for JWT verification

// import config from "../config/config";

//  **Extending Fastify to Add Custom Authentication**
// This extends Fastify's instance to include an `authentication` method.
// This allows us to use `server.authentication` in our route handlers.
declare module "fastify" {
  export interface FastifyInstance {
    authentication: (
      request: FastifyRequest,
      reply: FastifyReply
    ) => Promise<void>;
  }
}

//  **Environment Variables for AWS Cognito**
// AWS Cognito provides a JSON Web Key Set (JWKS) for token verification.
const USER_POOL_ID = process.env.AWS_COGNITO_USER_POOL_ID; // Cognito User Pool ID
const REGION = process.env.AWS_REGION; // AWS region where the Cognito pool is hosted
const JWK_URL = `https://cognito-idp.${REGION}.amazonaws.com/${USER_POOL_ID}/.well-known/jwks.json`; // URL to fetch the JWKS

//  **Caching JWKs (JSON Web Key Set)**
// - AWS Cognito provides public keys (JWKs) to verify JWTs.
// - To avoid fetching them on every request, we cache them in-memory.
let jwksCache: any = null; // Stores the JWKs
let jwksLastFetch = 0; // Timestamp of last fetch
const CACHE_TTL = 24 * 60 * 60 * 1000; // Set a 24-hour cache lifespan

//  **Function to Fetch and Cache JWKs**
// This function retrieves the JWKs from AWS Cognito and caches them.
async function getJwks() {
  const now = Date.now();

  // Check if cache is still valid
  if (!jwksCache || now - jwksLastFetch > CACHE_TTL) {
    try {
      const response = await axios.get(JWK_URL); // Fetch JWKs from AWS
      jwksCache = response.data.keys; // Store keys in cache
      jwksLastFetch = now; // Update last fetch timestamp
    } catch (error) {
      console.error("Error fetching JWKs from Cognito:", error);
      throw new Error("Failed to retrieve JWKs");
    }
  }

  return jwksCache; // Return cached keys
}

//  **Function to Validate JWT Token**
// - Decodes and verifies the token using AWS Cognito's public keys (JWKs).
export async function validateToken(token: string) {
  //  **Step 1: Decode JWT (Extract Header)**
  const decodedToken = jwt.decode(token, { complete: true });

  // If decoding fails, the token is invalid
  if (!decodedToken || !decodedToken.header.kid) {
    throw new Error("Invalid token format");
  }

  //  **Step 2: Fetch JWKs & Find Matching Key**
  const jwks = await getJwks();
  const key = jwks.find((k: any) => k.kid === decodedToken.header.kid);

  if (!key) {
    throw new Error("Invalid token signature: Key ID not found");
  }

  //  **Step 3: Convert JWK to PEM Format**
  // PEM is required for JWT verification
  const pem = jwkToPem(key);

  //  **Step 4: Verify the JWT Token**
  try {
    const verifiedToken = jwt.verify(token, pem, {
      issuer: `https://cognito-idp.${REGION}.amazonaws.com/${USER_POOL_ID}`, // Expected issuer
      algorithms: ["RS256"], // Cognito uses RS256 (asymmetric encryption)
    });

    return verifiedToken; // Return decoded & verified JWT payload
  } catch (error) {
    console.error("JWT Verification Failed:", error);
    throw new Error("Invalid token");
  }
}

//  **Fastify Authentication Plugin**
// - Registers `server.authentication` to validate JWTs in protected routes.
const authPlugin: FastifyPluginCallback = (server, options, done) => {
  //  **Step 1: Attach Authentication Method to Fastify**
  server.decorate(
    "authentication",
    async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      try {
        // Extract JWT from cookies instead of headers
        const token = request.cookies.authToken;

        if (!token) {
          return reply
            .code(401)
            .send({ message: "No authentication token provided" });
        }

        // Validate the token
        const verifiedToken = await validateToken(token);

        // Attach user data to request (so routes can access it)
        (request as any).user = verifiedToken;
      } catch (error) {
        return reply
          .code(401)
          .send({ message: "Invalid authentication token" });
      }
    }
  );

  //  **Step 5: Mark Plugin as Done**
  done();
};

//  **Export the Authentication Plugin**
export default fastifyPlugin(authPlugin);
