// properties/controller.js
import { PropertyService } from "./service.js";
import { propertySchema, validateWithJoi } from "./schema.js";
import {
  ApiError,
  AuthError as AuthorizationError ,
  BadRequestError,
  InvalidInputError,
  NotFoundError,
  ValidationError,
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
        limit: Joi.number().min(1).max(100).default(10),
      }).validateAsync(req.query);

      const result = await PropertyService.listApprovedProperties({
        page,
        limit,
      });

      res.header("Cache-Control", "public, max-age=300").json(result);
    } catch (error) {
      res.status(error.statusCode || 500).json({
        error: error.message || "Failed to fetch properties",
      });
    }
  }

  static async getOwnerProperties(req, res) {
    try {
      const requestedOwnerId = req.params.ownerId || req.user.id;
      const isOwnerRequest = requestedOwnerId === req.user.id;

      // Validate access rights
      if (!isOwnerRequest && req.user.role !== "admin") {
        throw new AuthError("Unauthorized access");
      }

      const result = await PropertyService.getOwnerProperties(
        requestedOwnerId,
        {
          page: Math.max(1, parseInt(req.query.page) || 1),
          limit: Math.min(100, Math.max(1, parseInt(req.query.limit) || 10)),
          isOwnerRequest,
        }
      );

      res.set("Cache-Control", "public, max-age=300").json(result);
    } catch (error) {
      const status = error.statusCode || 500;
      res.status(status).json({
        error: status === 500 ? "Internal server error" : error.message,
      });
    }
  }

  static async getPublicOwnerProperties(req, res) {
    try {
      const result = await PropertyService.getPublicOwnerProperties(
        req.params.ownerId,
        {
          page: Math.max(1, parseInt(req.query.page) || 1),
          limit: Math.min(100, Math.max(1, parseInt(req.query.limit) || 10)),
        }
      );
      res.json(result);
    } catch (error) {
      res.status(error.statusCode || 500).json({
        error: error.message || "Failed to fetch properties",
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

  static async updateAvailability(req, res) {
    try {
      const { id: propertyId } = req.params;
      const availabilitySlots = req.body;

      // Validate property ID format
      if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          propertyId
        )
      ) {
        throw new ValidationError("Invalid property ID format");
      }

      // Validate input structure
      if (!Array.isArray(availabilitySlots) || availabilitySlots.length === 0) {
        throw new ValidationError(
          "Availability data must be a non-empty array"
        );
      }

      // Basic slot validation
      const validatedSlots = availabilitySlots.map((slot, index) => {
        if (
          !slot.startDate ||
          !slot.endDate ||
          typeof slot.basePrice === "undefined"
        ) {
          throw new ValidationError(
            `Slot ${
              index + 1
            } missing required fields (startDate, endDate, basePrice)`
          );
        }

        return {
          ...slot,
          startDate: new Date(slot.startDate),
          endDate: new Date(slot.endDate),
          basePrice: Number(slot.basePrice),
        };
      });

      // Verify property ownership (unless admin)
      if (req.user.role !== "admin") {
        const property = await prisma.property.findUnique({
          where: { id: propertyId },
          select: { ownerId: true },
        });

        // if (!property || property.ownerId !== req.user.id) {
        //   throw new AuthorizationError(
        //     "You don't have permission to update this property's availability"
        //   );
        // }
      }

      // Process update
      const result = await PropertyService.updateAvailability(
        propertyId,
        validatedSlots
      );

      res.json({
        success: true,
        updatedSlots: result.updatedSlots,
        message: "Availability successfully updated",
      });
    } catch (error) {
      const statusCode =
        error.statusCode ||
        (error instanceof ValidationError
          ? 400
          : error instanceof AuthorizationError
          ? 403
          : 500);

      res.status(statusCode).json({
        error: error.message || "Availability update failed",
        ...(process.env.NODE_ENV === "development" && {
          details: error.details,
          stack: error.stack,
        }),
      });
    }
  }

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
