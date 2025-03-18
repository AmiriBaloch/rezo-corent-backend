// middlewares/validate.js
import Joi from "joi";
import { logger } from "../config/logger.js";

const validate = (schema) => async (req, res, next) => {
  const validationOptions = {
    abortEarly: false,
    allowUnknown: true,
    stripUnknown: true,
  };

  try {
    const value = await schema.validateAsync(req.body, validationOptions);
    req.body = value;
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
