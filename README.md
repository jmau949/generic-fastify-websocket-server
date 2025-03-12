# 🚀 Generic Fastify WebSocket Server

A **production-grade Fastify WebSocket server** with:
- **Fastify** (`@fastify/websocket`) for WebSocket handling.
- **JWT authentication** via **AWS Cognito** with **HTTP-only cookies**.
- **Auto-reconnection** and **broadcasting support**.
- **Graceful error handling** and **scalability features**.

## 📌 **Tech Stack**
### **Backend**
- **Fastify** (`@fastify/websocket`) → WebSocket framework.
- **Fastify Cookie** (`@fastify/cookie`) → Reads `authToken` from HTTP-only cookies.
- **JWT Verification** (`jsonwebtoken` & `jwk-to-pem`) → Validates AWS Cognito JWT tokens.
- **AWS Cognito** → User authentication and token validation.

### **Frontend**
- **WebSockets API** → Establishes and maintains the connection.
- **Auth Context (`AuthProvider.jsx`)** → Manages authentication and integrates with WebSocket.
- **Reconnect Strategy** → Exponential backoff for re-establishing lost connections.

---

## 📌 **How It Works**
### **1️⃣ Authentication (JWT via HTTP-only Cookies)**
- **User logs in** via the frontend.
- Backend **sets `authToken`** as an **HTTP-only cookie** (not accessible by JavaScript).
- WebSocket **relies on the browser automatically sending cookies** in requests.

### **2️⃣ WebSocket Authentication**
- **Frontend connects to WebSocket (`ws://localhost:3020/ws`)**.
- The **backend extracts `authToken` from cookies** and validates it.
- **If valid** → Connection is established.
- **If invalid** → The server closes the WebSocket connection (`1008` policy violation).

---

## 📌 **Project Setup**
### **1️⃣ Install Dependencies**
```sh
npm install
```

### **2️⃣ Set Up Environment Variables (`.env`)**
```env
PORT=3020
AWS_ACCESS_KEY_ID=AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY=AWS_SECRET_ACCESS_KEY
AWS_COGNITO_USER_POOL_ID=your-pool-id
AWS_REGION=your-region
AWS_COGNITO_CLIENT_ID=AWS_COGNITO_CLIENT_ID
AWS_COGNITO_CLIENT_SECRET=AWS_COGNITO_CLIENT_SECRET
```

### **3️⃣ Start the WebSocket Server**
```sh
npm run dev
```

---

# 📡 Socket.io Integration with Fastify

This document explains how **Socket.io** works in a Fastify application, how clients connect, and how authentication is handled.

---

## 🔧 How Socket.io Works

### 1️⃣ Setting Up the Server
- Socket.io **attaches** itself to Fastify's HTTP server.
- Clients connect via WebSockets or fallback to polling.

```typescript
import { FastifyInstance } from "fastify";
import { Server as IOServer, Socket } from "socket.io";
import { validateToken } from "../plugins/auth"; // Import JWT validation function

export default async function socketPlugin(fastify: FastifyInstance) {
  const io = new IOServer(fastify.server, {
    cors: {
      origin: "http://localhost:5173", // Restrict to allowed origins
      methods: ["GET", "POST"],
      credentials: true, // Allow cookies & authorization headers
    },
  });

  fastify.decorate("io", io);

  // Middleware for authentication
  io.use(async (socket: Socket, next) => {
    try {
      const cookieHeader = socket.handshake.headers.cookie;
      if (!cookieHeader) return next(new Error("Missing authentication token"));

      const cookies = Object.fromEntries(
        cookieHeader.split("; ").map((c) => c.split("="))
      );
      const token = cookies.authToken;
      if (!token) return next(new Error("Missing authentication token"));

      const user = await validateToken(token);
      if (!user) return next(new Error("Invalid authentication token"));

      (socket as any).user = user;
      fastify.log.info(`Socket authenticated: User ${user.sub}`);
      next();
    } catch (error) {
      next(new Error("Authentication failed"));
    }
  });

  io.on("connection", (socket) => {
    const user = (socket as any).user;
    fastify.log.info(`Socket connected: ${socket.id}, User: ${user.sub}`);

    socket.on("customEvent", (data) => {
      socket.emit("customResponse", {
        message: "Hello from Fastify and Socket.io!",
      });
    });

    socket.on("disconnect", () => {
      fastify.log.info(`Socket disconnected: ${socket.id}, User: ${user.sub}`);
    });
  });
}

# 2️⃣ How Clients Connect

Clients use Socket.io's client library to establish a WebSocket connection.

```javascript
import { io } from "socket.io-client";

const socket = io("http://localhost:3020", {
  withCredentials: true, // Sends authentication cookies
});

// Listen for a successful connection
socket.on("connect", () => {
  console.log("Connected to server:", socket.id);
});

// Send a custom event
socket.emit("customEvent", { message: "Hello from client" });

// Listen for a response
socket.on("customResponse", (data) => {
  console.log("Received response:", data);
});

// Handle disconnection
socket.on("disconnect", () => {
  console.log("Disconnected from server");
});
```

## ⚙️ How Authentication Works

- Client sends a request to the server including the authToken inside cookies.
- Server intercepts the request in the `io.use()` middleware.
- Server extracts the token from `socket.handshake.headers.cookie`.
- Server validates the token using `validateToken()`.
- If valid, the client is allowed to connect.
- If invalid, the connection is rejected.

## 🔀 How Socket.io Handles Multiple Clients

Each client gets its own `socket.id` (unique identifier). The server maintains a connection for each client.

### Example: Sending messages to all clients

```typescript
io.emit("message", { message: "Broadcast to all connected clients" });
```

### Example: Sending a message to a specific client

```typescript
socket.emit("privateMessage", { message: "Hello, user!" });
```

### Example: Handling client disconnects

```typescript
socket.on("disconnect", () => {
  console.log(`Client disconnected: ${socket.id}`);
});
```

## 🚀 Key Takeaways

- No explicit route is needed – Socket.io automatically manages connections.
- Each client has its own socket – Identified by `socket.id`.
- Authentication is validated before connection – Using cookies & JWTs.
- Clients can send & receive real-time messages – With `emit()` & `on()`.
- The server tracks active connections dynamically – Handles joins/disconnects.

