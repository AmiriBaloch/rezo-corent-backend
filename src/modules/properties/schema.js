// properties/validation.js
import Joi from "joi";

// Reusable validation schemas
export const propertySchema = Joi.object({
  title: Joi.string().min(5).max(120).required(),
  description: Joi.string().min(20).max(2000).required(),
  basePrice: Joi.number().positive().required(),
  currency: Joi.string().length(3).default("USD"),
  address: Joi.string().max(255).required(),
  maxGuests: Joi.number().integer().positive().required(),
  minStay: Joi.number().integer().positive().required(),
  maxStay: Joi.number().integer().positive().optional(),
  amenities: Joi.array().items(Joi.string()).optional(),
  location: Joi.object({
    lat: Joi.number().min(-90).max(90).required(),
    lng: Joi.number().min(-180).max(180).required(),
  }).required(),
  photos: Joi.array().items(Joi.string().uri()).optional(),
  virtualTours: Joi.array().items(Joi.string().uri()).optional(),
});

// Reusable validation function
export const validateWithJoi = (schema, data) => {
  const options = {
    abortEarly: false, // Return all errors, not just the first one
    allowUnknown: false, // Disallow unknown keys
    stripUnknown: true, // Remove unknown keys
  };

  return schema.validate(data, options);
};
