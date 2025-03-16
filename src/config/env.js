import convict from "convict";
import dotenv from "dotenv";

dotenv.config(); // Load .env variables

const config = convict({
  env: {
    doc: "The application environment.",
    format: ["production", "development", "test"],
    default: "development",
    env: "NODE_ENV",
  },
  port: {
    doc: "The port the server runs on",
    format: "port",
    default: 8000,
    env: "PORT",
  },
  databaseUrl: {
    doc: "Database connection URL",
    format: String,
    default: "",
    env: "DATABASE_URL",
  },
  jwtSecret: {
    doc: "JWT Secret Key for Access Token",
    format: String,
    default: "your_jwt_secret",
    env: "JWT_SECRET",
    sensitive: true,
  },
  refreshSecret: {
    doc: "JWT Secret Key for Refresh Token",
    format: String,
    default: "your_refresh_secret",
    env: "REFRESH_SECRET",
    sensitive: true,
  },
  redisUrl: {
    doc: "Redis connection URL",
    format: String,
    default: "redis://127.0.0.1:6379",
    env: "REDIS_URL",
  },
});

// Perform validation
config.validate({ allowed: "strict" });

export default config;
