import express from "express";
import helmet from "helmet";
import cors from "cors";
import { rateLimit } from "express-rate-limit";
import { httpLogger } from "./logger.js";
import prisma, { connectDB } from "./database.js";
import redis from "./redis.js";
import routes from "../modules/index.js";
import bodyParser from "body-parser";
import cookieParser from "cookie-parser";
import { errorHandler } from "../middlewares/errorHandler.js";
import initializePassport from "./passport.js";
import passport from "passport";
// import { initializeCasbin } from "../config/casbin.js";

const app = express();

// ========================
// Security Middleware
// ========================
initializePassport(passport);
app.use(passport.initialize());

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
// CORS Configuration
// ========================
app.use(
  cors({
    origin: "*", // Update for production security
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    credentials: true,
  })
);

//
//===================================== 
// Initialize Casbin on startup
//======================================
// initializeCasbin()
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
// Request Parsing
// ========================
app.use(cookieParser());
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true }));
app.use(bodyParser.urlencoded({ extended: true }));

// ========================
// Logging
// ========================
app.use(httpLogger);

// ========================
// Database Connections
// ========================
connectDB(); // Ensure PostgreSQL is connected

// ========================
// Application Routes
// ========================
app.use("/api", routes);

// ========================
// Health Check
// ========================
app.get("/", async (req, res) => {
  const dbStatus = await prisma.$queryRaw`SELECT 1`
    .then(() => "healthy")
    .catch(() => "unhealthy");

  const redisStatus = redis.status === "ready" ? "healthy" : "unhealthy";

  res.json({
    status: "ok",
    db: dbStatus,
    redis: redisStatus,
    timestamp: new Date().toISOString(),
  });
});

// ========================
// Error Handling
// ========================
app.use(errorHandler);

export default app;
