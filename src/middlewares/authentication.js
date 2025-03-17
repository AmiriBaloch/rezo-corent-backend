import passport from "passport";
import prisma from "../config/database.js";
import logger from "../config/logger.js";
import { initializeCasbin } from "../config/casbin.js";
import config from "../config/env.js";
import jwt from "jsonwebtoken";
import { AuthError } from "../utils/apiError.js";

// Load Casbin enforcer at startup
let enforcer;
initializeCasbin()
  .then((casbinInstance) => {
    enforcer = casbinInstance;
  })
  .catch((error) => {
    process.exit(1);
  });

const authMiddleware = (options = {}) => {
  return async (req, res, next) => {
    const requireVerified = options.requireVerified ?? true;
    const requireMFA = options.requireMFA ?? false;

    passport.authenticate(
      "jwt",
      { session: false, failWithError: true },
      async (error, user, info) => {
        try {
          if (error || !user) {
            logger.warn(
              `Authentication failed: ${info?.message || "Unknown error"}`
            );
            return next(new AuthError("Authentication failed"));
          }


          if (!user.isActive)
            return next(new PermissionError("Account deactivated"));
          if (requireVerified && !user.isVerified)
            return next(new PermissionError("Account not verified"));
          if (requireMFA && !user.mfaEnabled)
            return next(new PermissionError("MFA required"));

          req.user = user;

          // ✅ Casbin Authorization
          if (!enforcer) {
            logger.error("Casbin enforcer not initialized");
            return res.status(503).json({
              error: "Service Unavailable",
              message: "Authorization system is initializing",
              code: "AUTHZ_INITIALIZING",
            });
          }
         

          const resource = normalizeResource(req.path);
          const action = req.method.toLowerCase();

          const hasAccess = await enforcer.enforce(user.id, resource, action);

          if (!hasAccess) {
            logger.warn(
              `Unauthorized access attempt: ${user.id} -> ${resource} [${action}]`
            );
            return res.status(403).json({
              error: "Forbidden",
              message: "Insufficient permissions",
              code: "PERMISSION_DENIED",
            });
          }

          // ✅ Audit Logging
          try {
            await prisma.auditLog.create({
              data: {
                actionType: "API_REQUEST",
                entityType: "ENDPOINT",
                entityId: resource,
                userId: user.id,
                ipAddress: req.ip,
                userAgent: req.headers["user-agent"],
                metadata: {
                  method: req.method,
                  params: req.params,
                  query: req.query,
                },
              },
            });
          } catch (auditError) {
            logger.error(
              `Audit log failed for user ${user.id}: ${auditError.message}`,
              {
                path: req.path,
                method: req.method,
              }
            );
          }

          next();
        } catch (catchAllError) {
          logger.error(`Middleware error: ${catchAllError.message}`);
          res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred",
            code: "SERVER_ERROR",
          });
        }
      }
    )(req, res, next);
  };
};

// ✅ Normalize RESTful paths for Casbin
function normalizeResource(path) {
  return path
    .split("/")
    .map((segment) => (/^\d+$/.test(segment) ? ":id" : segment)) // Replace numeric IDs with :id
    .join("/")
    .replace(/\/+/g, "/") // Remove duplicate slashes
    .replace(/\/$/, ""); // Remove trailing slashes
}

// ✅ Strict JWT Verification for Secure Endpoints
export const strictJWT = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({
      error: "Unauthorized",
      message: "Missing authorization token",
      code: "TOKEN_MISSING",
    });
  }

  try {
    const decoded = jwt.verify(token, config.get("jwtSecret"), {
      algorithms: ["HS256"],
      issuer: config.get("jwtIssuer"), // ✅ Fixed: Use config
      audience: config.get("jwtAudience"), // ✅ Fixed: Use config
    });

    if (decoded.type !== "access") {
      return res.status(401).json({
        error: "Unauthorized",
        message: "Invalid token type",
        code: "INVALID_TOKEN_TYPE",
      });
    }

    req.jwtPayload = decoded;
    next();
  } catch (error) {
    const response =
      error.name === "TokenExpiredError"
        ? {
            error: "Unauthorized",
            message: "Token expired",
            code: "TOKEN_EXPIRED",
          }
        : {
            error: "Unauthorized",
            message: "Invalid token",
            code: "INVALID_TOKEN",
          };

    res
      .status(401)
      .header(
        "Clear-Site-Data",
        '"cache", "cookies", "storage", "executionContexts"'
      )
      .json(response);
  }
};

export default authMiddleware;
