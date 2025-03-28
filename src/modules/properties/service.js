// properties/service.js
import prisma from "../../config/database.js";
import PropertyDetails from "../../models/propertyDetails.js";
import { PricingService } from "../../utils/pricing.js";
import { v4 as isUUID } from "uuid";
export class PropertyService {
  static async createProperty(ownerId, data) {
    return await prisma.$transaction(async (tx) => {
      const property = await tx.property.create({
        data: {
          ...data,
          ownerId,
          status: "PENDING",
        },
      });

      await PropertyDetails.create({
        propertyId: property.id,
        description: data.description,
        amenities: [],
        photos: [],
        tags: [],
      });

      return property;
    });
  }

  static async updateProperty(propertyId, ownerId, data) {
    return await prisma.property.update({
      where: { id: propertyId, ownerId },
      data,
    });
  }

  static async getProperty(propertyId) {
    const [property, details] = await Promise.all([
      prisma.property.findUnique({
        where: { id: propertyId },
      }),
      PropertyDetails.findOne({ propertyId }),
    ]);

    return { ...property, details };
  }

  static async updateAvailability(propertyId, availability) {
    return await prisma.$transaction(async (tx) => {
      // Clear existing availability
      await tx.availability.deleteMany({ where: { propertyId } });
  
      // Create new availability slots
      const created = await tx.availability.createMany({
        data: availability.map((slot) => ({
          propertyId,
          startDate: new Date(slot.startDate),
          endDate: new Date(slot.endDate),
          price: PricingService.calculateDynamicPrice(slot.pricePerNight), // Use price field
          isAvailable: slot.isAvailable
        })),
      });
  
      return created;
    });
  }

  // services/propertyService.js
  static async searchProperties(filters) {
    try {
      // Validate UUID fields before query execution
      if (filters.ownerId && !isUUID(filters.ownerId)) {
        throw new Error("Invalid UUID format for ownerId");
      }
  
      return await prisma.$queryRaw`
        SELECT 
          p.*,
          ST_Distance(
            p.location,
            ST_SetSRID(ST_MakePoint(${parseFloat(filters.lng)}, ${parseFloat(filters.lat)}), 4326)
          )::numeric AS distance
        FROM "Property" p
        WHERE p.status = 'APPROVED'
        AND ST_DWithin(
          p.location,
          ST_SetSRID(ST_MakePoint(${parseFloat(filters.lng)}, ${parseFloat(filters.lat)}), 4326)::geography,
          ${parseInt(filters.radius || 5000)}
        )
        ${filters.searchTerm ? Prisma.sql`
          AND (p.title ILIKE ${"%" + filters.searchTerm + "%"}
          OR p.description ILIKE ${"%" + filters.searchTerm + "%"})
        ` : Prisma.empty}
        ORDER BY distance
        LIMIT ${parseInt(filters.limit || 10)}
      `;
    } catch (error) {
      console.error("Database query error:", error);
      throw new Error("Failed to execute search query");
    }
  }
}
