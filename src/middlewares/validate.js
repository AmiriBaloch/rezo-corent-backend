// middlewares/validate.js
import Joi from "joi";
import { logger } from "../config/logger.js";

const validate = (schema) => async (req, res, next) => {
  const validationOptions = {
    abortEarly: false, // Return all validation errors
    allowUnknown: true, // Allow unknown keys that will be ignored
    stripUnknown: true, // Remove unknown keys from validated data
  };

  try {
    // Validate request against schema
    const value = await schema.validateAsync(
      {
        body: req.body,
        query: req.query,
        params: req.params,
      },
      validationOptions
    );

    // Replace request properties with validated values
    req.body = value.body || {};
    req.query = value.query || {};
    req.params = value.params || {};

    return next();
  } catch (error) {
    logger.error(`Validation error: ${error.message}`);

    const errors = error.details.map((detail) => ({
      field: detail.context.key,
      message: detail.message.replace(/['"]/g, ""),
    }));

    return res.status(400).json({
      success: false,
      code: "VALIDATION_ERROR",
      message: "Invalid request data",
      errors,
    });
  }
};

export default validate;
