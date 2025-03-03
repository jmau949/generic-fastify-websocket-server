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

### **3️⃣ WebSocket Messaging & Broadcasting**
- Users send messages to `/ws`.
- The backend **logs, processes, and broadcasts messages** to all connected clients.
- Messages are JSON formatted:  
  ```json
  { "user": "USER_ID", "message": "Hello WebSocket!" }
  ```

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

## 📌 **Code Overview**
### **Backend**
#### **`server.ts` (Fastify Server Setup)**
```ts
import Fastify from "fastify";
import websocketPlugin from "@fastify/websocket";
import fastifyCookie from "@fastify/cookie";
import { websocketController } from "./controllers/websocketController";

const server = Fastify({ logger: true });

server.register(fastifyCookie, {
  secret: process.env.COOKIE_SECRET || "my-secret",
  parseOptions: { httpOnly: true, secure: false, sameSite: "strict" },
});

server.register(websocketPlugin);
server.register(websocketController);

server.listen({ port: 3020, host: "0.0.0.0" }).then(() => {
  server.log.info(" WebSocket server running on ws://localhost:3020/ws");
});
```

#### **`websocketController.ts` (Handles WebSocket Connections)**
```ts
import { FastifyInstance, FastifyRequest } from "fastify";
import WebSocket from "ws";
import { validateToken } from "../plugins/auth";

export async function websocketController(fastify: FastifyInstance) {
  const clients = new Set<WebSocket>();

  fastify.get(
    "/ws",
    { websocket: true },
    async (socket: WebSocket, req: FastifyRequest) => {
      try {
        const token = req.cookies.authToken;
        if (!token) {
          socket.close(1008, "Missing authentication token");
          return;
        }

        const user = await validateToken(token);
        if (!user) {
          socket.close(1008, "Invalid authentication token");
          return;
        }

        clients.add(socket);
        fastify.log.info(`WebSocket connected: User ${user.sub}`);

        socket.on("message", (message: WebSocket.RawData) => {
          const msg = message.toString();
          fastify.log.info(`📩 Received from ${user.sub}: ${msg}`);

          for (const client of clients) {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({ user: user.sub, message: msg }));
            }
          }
        });

        socket.on("close", () => {
          clients.delete(socket);
          fastify.log.info(`WebSocket disconnected: User ${user.sub}`);
        });

      } catch (error) {
        socket.close(1008, "Authentication failed");
      }
    }
  );
}
```

---

### **Frontend**
#### **`socketService.js` (WebSocket Client)**
```js
class SocketService {
  constructor() {
    this.socket = null;
    this.onMessageCallback = null;
    this.reconnectAttempts = 0;
    this.maxReconnects = 5;
  }

  connect() {
    const socketUrl = import.meta.env.VITE_SOCKET_BASE_URL;
    this.socket = new WebSocket(socketUrl);
    this.socket.withCredentials = true; //  Automatically sends cookies

    this.socket.onopen = () => console.log("WebSocket connected.");
    this.socket.onmessage = (event) => this.onMessageCallback?.(event.data);
    this.socket.onerror = (error) => console.error("❌ WebSocket error:", error);
    this.socket.onclose = () => this.handleReconnect();
  }

  sendMessage(message) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    } else {
      console.error(" WebSocket is not open.");
    }
  }

  handleReconnect() {
    if (this.reconnectAttempts < this.maxReconnects) {
      setTimeout(() => {
        this.reconnectAttempts += 1;
        this.connect();
      }, Math.pow(2, this.reconnectAttempts) * 1000);
    } else {
      console.error(" Max reconnection attempts reached.");
    }
  }
}

const socketService = new SocketService();
export default socketService;
```

#### **`AuthProvider.jsx` (Manages Authentication & WebSocket)**
```js
import { createContext, useContext, useEffect, useState } from "react";
import { loginUser, fetchCurrentUser, logoutUser } from "../api/user/userService";
import socketService from "../socketService";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const currentUser = await fetchCurrentUser();
        setUser(currentUser);
        if (currentUser) socketService.connect();
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    };
    loadUser();
  }, []);

  const login = async (email, password) => {
    await loginUser({ email, password });
    const currentUser = await fetchCurrentUser();
    setUser(currentUser);
    socketService.connect();
  };

  const logout = async () => {
    await logoutUser();
    setUser(null);
    socketService.socket?.close();
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

