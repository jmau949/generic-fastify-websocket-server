const corsConfig = {
  dev: {
    origin: "http://localhost:5173", // Allow local development frontend
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true, // Allow credentials to be included
  },
  production: {
    origin: ["https://your-frontend-domain.com"], // Allow only your production frontend
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true, // Enable credentials if needed (for cookies, etc.)
  },
};

export default corsConfig;
