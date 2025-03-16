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
  frontendUrl: {
    doc: "Frontend URL",
    format: String,
    default: "http://localhost:3000",
    env: "FRONTEND_URL",
  },
  googleClientId: {
    doc: "Google Client ID",
    format: String,
    default: "",
    env: "GOOGLE_CLIENT_ID",
  },
  googleClientSecret: {
    doc: "Google Client Secret",
    format: String,
    default: "",
    env: "GOOGLE_CLIENT_SECRET",
    sensitive: true,
  },
  email: {
    host: {
      doc: "Email SMTP host",
      format: String,
      default: "smtp.ethereal.email",
      env: "EMAIL_HOST",
    },
    port: {
      doc: "Email SMTP port",
      format: "port",
      default: 587,
      env: "EMAIL_PORT",
    },
    secure: {
      doc: "Email SMTP secure connection",
      format: Boolean,
      default: false,
      env: "EMAIL_SECURE",
    },
    user: {
      doc: "Email SMTP user",
      format: String,
      default: "",
      env: "EMAIL_USER",
    },
    pass: {
      doc: "Email SMTP password",
      format: String,
      default: "",
      env: "EMAIL_PASS",
      sensitive: true,
    },
  },
});

// Perform validation
config.validate({ allowed: "strict" });

export default config;
