import express from "express";
import helmet from "helmet";
import cors from "cors";
import { rateLimit } from "express-rate-limit";
import logger, { httpLogger } from "./logger.js";
import prisma, { connectDB as connectPostgres } from "./database.js";
import redis from "./redis.js";
import routes from "../modules/index.js";
import bodyParser from "body-parser";
import cookieParser from "cookie-parser";
import { errorHandler } from "../middlewares/errorHandler.js";
import initializePassport from "./passport.js";
import passport from "passport";
import { swaggerDocs } from "./swagger.js";
import { initializeCasbin } from "../config/casbin.js";
import { connectMongoDB, disconnectMongoDB } from "./mongodb.js";
import mongoose from "mongoose";
import csrf from "csurf";

import { setupWebSocket, getIO } from "../websocket/index.js";
// import { createServer } from "http";
// import session from "express-session";
// import config from "./env.js";
import { sessionMiddleware } from "./session.js";
const app = express();
// const server = createServer(app);

// ========================
// Request Parsing
// ========================
app.use(cookieParser());
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true }));
app.use(bodyParser.urlencoded({ extended: true }));
// ========================
// Security Middleware
// ========================

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https://*.valid-cdn.com"],
        connectSrc: ["'self'", "https://*.valid-api.com"],
      },
    },
  })
);

// ========================
// Session Middleware
// =========================
app.use(sessionMiddleware);
// app.use(
//   session({
//     secret:
//       config.get("sessionSecrate") || crypto.randomBytes(64).toString("hex"),
//     resave: false,
//     saveUninitialized: false, // Changed for GDPR compliance
//     store:
//       config.get("env") === "production"
//         ? new RedisStore({ client: redisClient })
//         : null,
//     cookie: {
//       secure: false,
//       secure: config.get("env") === "production",
//       httpOnly: true,
//       sameSite: "lax",
//       maxAge: 24 * 60 * 60 * 1000,
//     },
//   })
// );

// ========================
// CORS Configuration
// ========================
// temprarily disabled for local development
app.use(
  cors({
    origin: ["http://localhost:5173"], // Update for production security
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    credentials: true,
    allowedHeaders: ["Content-Type", "X-CSRF-Token"], // Add this line
  })
);

//
//=====================================
// Initialize Casbin on startup
//======================================
initializeCasbin();
// ========================
// Passport Middleware
// ========================
initializePassport(passport);
app.use(passport.initialize());
app.use(passport.session());
// Setup WebSocket
// setupWebSocket(server);
// ========================
// Rate Limiting
// ========================
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per window
    standardHeaders: true,
    legacyHeaders: false,
    message: "Too many requests, please try again later.",
  })
);

// ========================
// CSRF Protection
// ========================
const csrfProtection = csrf({
  cookie: {
    key: "_csrf",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax", // or 'strict' if same origin
    maxAge: 86400, // 24 hours
  },
  value: (req) => {
    // Check multiple possible token locations
    return (
      req.headers["x-csrf-token"] ||
      req.headers["xsrf-token"] ||
      req.body._csrf ||
      req.query._csrf
    );
  },
});

// Apply CSRF middleware after session but before routes
// app.use(csrfProtection);
// ========================
// Logging
// ========================
app.use(httpLogger);

// ========================
// Database Connections
// ========================

await connectPostgres();
await connectMongoDB();

// ========================
// Enhanced Health Check
// ========================
app.get("/", async (req, res) => {
  const healthCheck = {
    status: "ok",
    timestamp: new Date().toISOString(),
    services: {
      postgresql: "unhealthy",
      mongodb: "unhealthy",
      redis: "unhealthy",
    },
  };

  try {
    // PostgreSQL Check
    await prisma.$queryRaw`SELECT 1`;
    healthCheck.services.postgresql = "healthy";
  } catch (error) {
    healthCheck.status = "degraded";
    logger.error("PostgreSQL health check failed:", error);
  }

  try {
    if (mongoose.connection.readyState === 1) {
      healthCheck.services.mongodb = "healthy";
    } else {
      healthCheck.status = "degraded";
      logger.error("MongoDB is not connected properly.");
    }
  } catch (error) {
    healthCheck.status = "degraded";
    logger.error("MongoDB health check failed:", error);
  }

  // Redis Check
  try {
    const redisPing = await redis.ping();
    healthCheck.services.redis = redisPing === "PONG" ? "healthy" : "unhealthy";
  } catch (error) {
    healthCheck.status = "degraded";
    logger.error("Redis health check failed:", error);
  }

  // Determine overall status
  if (Object.values(healthCheck.services).every((s) => s === "healthy")) {
    healthCheck.status = "ok";
  } else if (
    Object.values(healthCheck.services).some((s) => s === "unhealthy")
  ) {
    healthCheck.status = "degraded";
  }

  res.status(healthCheck.status === "ok" ? 200 : 503).json(healthCheck);
});
app.get("/csrf-token", (req, res) => {
  res.json({
    message:
      "🧠 Thanks for submitting your CSRF token. It's now being carefully reviewed by our team of invisible squirrels. A pigeon will deliver your authentication results via Morse code. Please stand by near your mailbox. 📬",
  });
});
// ========================
// Application Routes
// ========================
app.use("/api", routes);

// ========================
// Error Handling
// ========================
app.use(errorHandler);
swaggerDocs(app);

// app.use((err, req, res, next) => {
//   if (err.code === "EBADCSRFTOKEN") {
//     console.error("CSRF Token Error:", {
//       url: req.originalUrl,
//       method: req.method,
//       headers: req.headers,
//       cookies: req.cookies,
//     });
//     return res.status(403).json({
//       error: "CSRF token validation failed",
//       solution: "Get a new token from /api/csrf-token",
//       details: process.env.NODE_ENV === "development" ? err.message : undefined,
//     });
//   }
//   next(err);
// });
export default app;
