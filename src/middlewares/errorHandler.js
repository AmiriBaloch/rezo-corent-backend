import { isApiError } from "../utils/apiError.js";
import { logger } from "../config/logger.js";

export const errorHandler = (err, req, res, next) => {
  if (isApiError(err)) {
    return err.format(res);
  }
  // Log unexpected errors
  logger.error("❌ Unexpected Error:", err);

  res.status(500).json({
    success: false,
    message: "Internal Server Error",
    timestamp: new Date().toISOString(),
  });
};
