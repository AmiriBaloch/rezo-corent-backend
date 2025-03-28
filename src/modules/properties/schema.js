// properties/schema.js
import Joi from "joi";


// Joi validation schemas
export const PropertySchema = Joi.object({
  title: Joi.string().min(3).max(120).required().messages({
    "string.empty": "Title cannot be empty",
    "string.min": "Title must be at least {#limit} characters",
    "string.max": "Title cannot exceed {#limit} characters",
  }),
  description: Joi.string().max(2000).required().messages({
    "string.empty": "Description cannot be empty",
    "string.max": "Description cannot exceed {#limit} characters",
  }),
  basePrice: Joi.number().positive().precision(2).required().messages({
    "number.base": "Price must be a valid number",
    "number.positive": "Price must be a positive value",
  }),
  currency: Joi.string().length(3).uppercase().required().messages({
    "string.length": "Currency must be 3 characters",
    "string.uppercase": "Currency must be uppercase",
  }),
  location: Joi.object({
    lat: Joi.number().min(-90).max(90).required(),
    lng: Joi.number().min(-180).max(180).required(),
  }).required(),
  address: Joi.string().max(255).required(),
  maxGuests: Joi.number().integer().positive().required().messages({
    "number.base": "Max guests must be a valid number",
    "number.integer": "Max guests must be an integer",
  }),
}).options({ abortEarly: false });

export const AvailabilitySchema = Joi.array()
  .items(
    Joi.object({
      startDate: Joi.date().iso().required(),
      endDate: Joi.date().iso().greater(Joi.ref("startDate")).required(),
      price: Joi.number().positive().precision(2).required(),
    })
  )
  .min(1)
  .messages({
    "array.min": "At least one availability slot is required",
    "date.greater": "End date must be after start date",
  });

// Custom validation middleware
export const validateProperty = (req, res, next) => {
  const { error } = PropertySchema.validate(req.body, {
    allowUnknown: false,
    stripUnknown: true,
  });

  if (error) {
    const errors = error.details.map((err) => ({
      field: err.path.join("."),
      message: err.message,
    }));
    return res.status(422).json({ errors });
  }

  next();
};

export const validateAvailability = (req, res, next) => {
  const { error } = AvailabilitySchema.validate(req.body, {
    allowUnknown: false,
    stripUnknown: true,
  });

  if (error) {
    const errors = error.details.map((err) => ({
      field: err.path.join("."),
      message: err.message,
    }));
    return res.status(422).json({ errors });
  }

  next();
};
