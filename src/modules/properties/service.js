// src/modules/properties/service.js
import prisma from "../../config/database.js";
import { PricingService } from "../../utils/pricing.js";
import {
  DatabaseError,
  ValidationError,
  ConflictError,
  NotFoundError,
  InvalidInputError,
} from "../../utils/apiError.js";
import { geoJSON } from "../../utils/geospatial.js";
import redis from "../../config/redis.js";
import { Prisma } from "@prisma/client";

export class PropertyService {
  /**
   * Create new property with full transactional safety
   */
  static async createProperty(ownerId, propertyData) {
    try {
      const property = await prisma.$transaction(async (tx) => {
        const property = await tx.property.create({
          data: {
            ownerId,
            status: "PENDING",
            ...this.sanitizePropertyData(propertyData),
            photos: propertyData.photos || [],
            virtualTours: propertyData.virtualTours || [],
          },
          include: { amenities: true, roomSpecs: true },
        });
        // Create related data (using arrow function)
        if (propertyData.amenities || propertyData.roomSpecs) {
          await this.createRelationalData(tx, property.id, propertyData);
        }

        // await this.createRelationalData(tx, property.id, propertyData);
        return property;
      });

      await this.cacheProperty(property);
      return property;
    } catch (error) {
      this.handleDatabaseError(error, "Property creation failed");
    }
  }

  // --- Helper Methods ---

  static sanitizePropertyData(data) {
    return {
      title: data.title,
      description: data.description,
      basePrice: data.basePrice,
      currency: data.currency,
      location: geoJSON.forDatabase(
        parseInt(data.location.lat),
        parseInt(data.location.lng)
      ),
      address: data.address,
      maxGuests: data.maxGuests,
      minStay: data.minStay,
      maxStay: data.maxStay,
      houseRules: data.houseRules,
      photos: data.photos || [],
      virtualTours: data.virtualTours || [],
    };
  }

  static async cacheProperty(property) {
    const cacheKey = `property:${property.id}`;
    const enriched = this.enrichPropertyData(property);
    await redis.setex(cacheKey, 3600, JSON.stringify(enriched));
  }

  static handleDatabaseError(error, context) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      throw new DatabaseError(`${context}: ${error.meta?.message}`);
    }
    if (error instanceof Prisma.PrismaClientValidationError) {
      throw new ValidationError("Invalid data structure provided");
    }
    throw error;
  }

  static enrichPropertyData(property) {
    return {
      ...property,
      stats: {
        bookings: property._count?.bookings || 0,
        reviews: property._count?.reviews || 0,
      },
      featuredPhoto: property.photos?.[0] || null,
    };
  }

  static async createRelationalData(tx, propertyId, propertyData) {
    // Implementation of relational data creation
    // Example:
    if (propertyData.amenities?.length) {
      await tx.amenity.createMany({
        data: propertyData.amenities.map((name) => ({
          propertyId,
          name,
        })),
      });
    }
  }
}
