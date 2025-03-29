// properties/controller.js
import { PropertyService } from "./service.js";
import { propertySchema, validateWithJoi } from "./schema.js";
import {
  ApiError,
  AuthError,
  BadRequestError,
  InvalidInputError,
  NotFoundError,
} from "../../utils/apiError.js";
import { logger } from "../../config/logger.js";
import Joi from "joi";
import prisma from "../../config/database.js";
export class PropertyController {
  static async createProperty(req, res, next) {
    try {
      // 1. Authentication check
      if (!req.user?.id) {
        throw new AuthError("Authentication required");
      }
      // 2. Validate input with reusable Joi validator
      const { error, value: validatedData } = validateWithJoi(
        propertySchema,
        req.body
      );

      if (error) {
        logger.error("Validation errors:", error.details); // Add this
        throw new BadRequestError(`${error.message}`);
      }

      // 3. Create property
      const property = await PropertyService.createProperty(
        req.user.id,
        validatedData
      );

      // 4. Success response
      res.status(201).json({
        status: "success",
        data: property,
      });
    } catch (error) {
      // Pass to error handling middleware
      next(error);
    }
  }

  static async deleteProperty(req, res, next) {
    try {
      if (!req.user?.id) {
        throw new AuthError("Authentication required");
      }

      // Sanitize and validate property ID
      const rawPropertyId = req.params.id;
      const propertyId = rawPropertyId.replace(/[^0-9a-f-]/gi, "");

      if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          propertyId
        )
      ) {
        throw new InvalidInputError("Invalid property ID format");
      }

      const user = req.user;

      // Authorization check
      if (user.role === "owner") {
        const property = await prisma.property.findUnique({
          where: { id: propertyId },
          select: { ownerId: true },
        });

        if (!property) throw new NotFoundError("Property not found");
        if (property.ownerId !== user.id)
          throw new AuthError("Unauthorized access");
      }

      await PropertyService.deleteProperty(
        propertyId,
        user.role === "admin" ? null : user.id
      );

      res.status(204).end();
    } catch (error) {
      logger.error(`Property deletion failed: ${error.message}`, {
        rawPropertyId: req.params.id,
        // sanitizedId: propertyId,
        userId: req.user?.id,
        stack: error.stack,
      });
      next(error);
    }
  }

  static async getProperty(req, res) {
    try {
      const property = await PropertyService.getProperty(req.params.id);

      res
        .set("Cache-Control", "public, max-age=3600")
        .json(property || { error: "Not found" });
    } catch (error) {
      res.status(error.statusCode || 500).json({
        error: error.message || "Failed to retrieve property",
      });
    }
  }
  static async listApprovedProperties(req, res) {
    try {
      const { page = 1, limit = 10 } = await Joi.object({
        page: Joi.number().min(1).default(1),
        limit: Joi.number().min(1).max(100).default(10)
      }).validateAsync(req.query);
  
      const result = await PropertyService.listApprovedProperties({ page, limit });
      
      res.header('Cache-Control', 'public, max-age=300').json(result);
    } catch (error) {
      res.status(error.statusCode || 500).json({
        error: error.message || 'Failed to fetch properties'
      });
    }
  }
  
  // static async updateProperty(req, res) {
  //   try {
  //     // const data = PropertySchema.partial().parse();
  //     const data = req.body;
  //     const property = await PropertyService.updateProperty(
  //       req.params.id,
  //       req.user.id,
  //       data
  //     );
  //     res.json(property);
  //   } catch (error) {
  //     res.status(403).json({ error: "Update failed" });
  //   }
  // }



  // static async updateAvailability(req, res) {
  //   try {
  //     const availability = req.body;
  //     const propertyId = req.params.id;

  //     // Validate input structure
  //     if (!Array.isArray(availability)) {
  //       return res
  //         .status(400)
  //         .json({ error: "Availability data must be an array" });
  //     }

  //     // Validate each slot
  //     for (const slot of availability) {
  //       if (!slot.startDate || !slot.endDate || !slot.pricePerNight) {
  //         return res.status(400).json({
  //           error: "Missing required fields in availability slot",
  //           requiredFields: ["startDate", "endDate", "pricePerNight"],
  //         });
  //       }
  //     }

  //     const result = await PropertyService.updateAvailability(
  //       propertyId,
  //       availability
  //     );
  //     res.json(result);
  //   } catch (error) {
  //     console.error("Availability update error:", error);
  //     res.status(400).json({
  //       error: "Invalid availability data",
  //       details: error.message,
  //     });
  //   }
  // }

  // static async searchProperties(req, res) {
  //   try {
  //     const lat = parseFloat(req.query.lat);
  //     const lng = parseFloat(req.query.lng);
  //     const radius = parseInt(req.query.radius) || 5000;
  //     const ownerId = req.query.ownerId;

  //     if (isNaN(lat) || isNaN(lng)) {
  //       return res.status(400).json({ error: "Invalid coordinates" });
  //     }

  //     if (ownerId && !isUUID(ownerId)) {
  //       return res
  //         .status(400)
  //         .json({ error: "Invalid UUID format for ownerId" });
  //     }

  //     const results = await PropertyService.searchProperties({
  //       ...req.query,
  //       lat,
  //       lng,
  //       radius,
  //       ownerId,
  //     });

  //     res.json({
  //       count: results.length,
  //       results,
  //     });
  //   } catch (error) {
  //     console.error("Search error:", error);
  //     res.status(500).json({
  //       error: "Search failed",
  //       details: error.message,
  //     });
  //   }
  // }
}
