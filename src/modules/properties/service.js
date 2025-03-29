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

  /**
   * Optimized property retrieval with deep relations
   */
  static async getProperty(propertyId) {
    const CACHE_TTL = 3600; // 1 hour in seconds
    const cacheKey = `property:${propertyId}`;

    try {
      // 1. Check cache first
      const cachedData = await redis.get(cacheKey);
      if (cachedData) {
        try {
          return JSON.parse(cachedData);
        } catch (parseError) {
          await redis.del(cacheKey);
          throw new DatabaseError("Invalid cache data format");
        }
      }

      // 2. Cache miss - query database
      const property = await prisma.property.findUnique({
        where: { id: propertyId },
        include: {
          amenities: true,
          roomSpecs: true,
          availability: {
            where: { isAvailable: true },
            orderBy: { startDate: "asc" },
          },
          _count: {
            select: { bookings: true, reviews: true },
          },
        },
      });

      if (!property) {
        // Cache negative result to prevent DB queries for missing properties
        await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(null));
        throw new NotFoundError("Property not found");
      }

      // 3. Enrich data
      const enrichedProperty = this.enrichPropertyData(property);

      // 4. Update cache async to avoid blocking response
      redis
        .setex(cacheKey, CACHE_TTL, JSON.stringify(enrichedProperty))
        .catch((err) => console.error("Cache update failed:", err));

      return enrichedProperty;
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      this.handleDatabaseError(error, "Property retrieval failed");
    }
  }

  /**
   * Retrieves a paginated list of approved properties from the database,
   * including related amenities and room specifications. Results are cached
   * for improved performance.
   *
   * @async
   * @function
   * @param {Object} params - The parameters for the query.
   * @param {number} params.page - The current page number for pagination.
   * @param {number} params.limit - The number of items per page.
   * @returns {Promise<Object>} A promise that resolves to an object containing
   * the list of approved properties and metadata about pagination.
   * @throws {Error} Throws an error if the database query fails.
   *
   * @example
   * const result = await listApprovedProperties({ page: 1, limit: 10 });
   * console.log(result.data); // Array of approved properties
   * console.log(result.meta); // Pagination metadata
   */
  static async listApprovedProperties({ page, limit }) {
    const CACHE_TTL = 300; // 5 minutes
    const cacheKey = `approved_properties:page:${page}:limit:${limit}`;

    try {
      const cached = await redis.get(cacheKey);
      if (cached) return JSON.parse(cached);

      const [properties, total] = await prisma.$transaction([
        prisma.property.findMany({
          where: { status: "APPROVED" },
          include: {
            amenities: { select: { id: true, name: true } },
            roomSpecs: { select: { type: true, count: true } },
          },
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { createdAt: "desc" },
        }),
        prisma.property.count({ where: { status: "APPROVED" } }),
      ]);

      const result = {
        data: properties,
        meta: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };

      redis.setex(cacheKey, CACHE_TTL, JSON.stringify(result));
      return result;
    } catch (error) {
      this.handleDatabaseError(error, "Failed to list approved properties");
    }
  }

  /**
   * Retrieves a paginated list of properties owned by a specific owner.
   *
   * @param {string} ownerId - The UUID of the owner whose properties are to be fetched.
   * @param {Object} [pagination={}] - Pagination options.
   * @param {number} [pagination.page=1] - The page number to retrieve.
   * @param {number} [pagination.limit=10] - The number of items per page.
   * @returns {Promise<Object>} A promise that resolves to an object containing the properties data and metadata.
   * @throws {ValidationError} If the provided ownerId is not a valid UUID.
   * @throws {Error} If there is an issue with the database query or cache operation.
   *
   * @example
   * const properties = await getOwnerProperties('123e4567-e89b-12d3-a456-426614174000', { page: 2, limit: 5 });
   * console.log(properties.data); // Array of properties
   * console.log(properties.meta); // Pagination metadata
   */

  static async getOwnerProperties(
    ownerId,
    { page = 1, limit = 10, isOwnerRequest = false } = {}
  ) {
    const CACHE_TTL = 300;
    const accessType = isOwnerRequest ? "owner" : "public";
    const cacheKey = `properties:${ownerId}:${accessType}:page_${page}_limit_${limit}`;

    try {
      // Validation
      if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          ownerId
        )
      ) {
        throw new ValidationError("Invalid owner ID format");
      }

      // Cache check
      const cached = await redis.get(cacheKey);
      if (cached) return JSON.parse(cached);

      // Dynamic filtering
      const statusFilter = isOwnerRequest ? { not: "ARCHIVED" } : "APPROVED";

      // Database operations
      const [properties, total] = await prisma.$transaction([
        prisma.property.findMany({
          where: { ownerId, status: statusFilter },
          include: {
            amenities: { select: { name: true } },
            roomSpecs: { select: { type: true, count: true } },
            _count: { select: { bookings: true, reviews: true } },
          },
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { createdAt: "desc" },
        }),
        prisma.property.count({ where: { ownerId, status: statusFilter } }),
      ]);

      // Prepare response
      const result = {
        data: properties.map((p) => ({
          ...p,
          stats: p._count,
          featuredPhoto: p.photos?.[0],
        })),
        meta: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };

      // Cache with error handling
      redis
        .setex(cacheKey, CACHE_TTL, JSON.stringify(result))
        .catch((err) => console.error("Cache Error:", err));

      return result;
    } catch (error) {
      this.handleDatabaseError(error, "Property fetch failed");
    }
  }


  /**
   * Fetches a paginated list of public properties for a given owner.
   * 
   * This method retrieves properties that are approved and not deleted, 
   * with support for caching and pagination. It also validates the owner ID format.
   * 
   * @param {string} ownerId - The UUID of the property owner.
   * @param {Object} options - Pagination options.
   * @param {number} [options.page=1] - The page number to retrieve.
   * @param {number} [options.limit=10] - The number of properties per page.
   * @returns {Promise<Object>} A promise that resolves to an object containing:
   *   - `data` (Array): The list of properties with details.
   *   - `meta` (Object): Metadata about the pagination (page, limit, total, totalPages).
   * @throws {ValidationError} If the ownerId is not a valid UUID.
   * @throws {Error} If there is an issue with the database or caching.
   */
  static async getPublicOwnerProperties(ownerId, { page = 1, limit = 10 }) {
    const CACHE_TTL = 300; // 5 minutes
    const cacheKey = `public_properties:${ownerId}:page_${page}_limit_${limit}`;

    try {
      // Validate UUID format
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(ownerId)) {
        throw new ValidationError("Invalid owner ID format");
      }

      // Check cache
      const cached = await redis.get(cacheKey);
      if (cached) return JSON.parse(cached);

      // Database query
      const [properties, total] = await prisma.$transaction([
        prisma.property.findMany({
          where: {
            ownerId,
            status: "APPROVED",
            deletedAt: null
          },
          select: {
            id: true,
            title: true,
            description: true,
            photos: true,
            amenities: { select: { name: true } },
            roomSpecs: { select: { type: true, count: true } },
            _count: { select: { reviews: true } }
          },
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { createdAt: "desc" }
        }),
        prisma.property.count({
          where: { 
            ownerId,
            status: "APPROVED",
            deletedAt: null
          }
        })
      ]);

      // Transform data
      const result = {
        data: properties.map(p => ({
          ...p,
          rating: p._count.reviews > 0 ? (p.totalRating / p._count.reviews) : null,
          featuredPhoto: p.photos?.[0]
        })),
        meta: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      };

      // Cache with error handling
      redis.setex(cacheKey, CACHE_TTL, JSON.stringify(result))
        .catch(err => console.error("Cache Error:", err));

      return result;
    } catch (error) {
      this.handleDatabaseError(error, "Failed to fetch public properties");
    }
  }

   /**
   * Sophisticated availability management with conflict detection
   */

   static async updateAvailability(propertyId, availabilitySlots) {
    try {
      // Validate input structure
      if (!availabilitySlots?.length) {
        throw new ValidationError("At least one availability slot required");
      }
  
      return await prisma.$transaction(async (tx) => {
        // 1. Validate slots before any DB operations
        const validatedSlots = availabilitySlots.map(slot => {
          const startDate = new Date(slot.startDate);
          const endDate = new Date(slot.endDate);
          
          if (isNaN(startDate) || isNaN(endDate)) {
            throw new ValidationError("Invalid date format in availability slots");
          }
          if (startDate >= endDate) {
            throw new ValidationError("Start date must be before end date");
          }
          if (typeof slot.basePrice !== 'number' || slot.basePrice < 0) {
            throw new ValidationError("Invalid base price");
          }
  
          return {
            ...slot,
            startDate,
            endDate,
            price: PricingService.calculateDynamicPrice(slot.basePrice, slot.dates)
          };
        });
  
        // 2. Check for slot overlaps in input
        const sortedSlots = validatedSlots.sort((a, b) => a.startDate - b.startDate);
        for (let i = 1; i < sortedSlots.length; i++) {
          if (sortedSlots[i].startDate < sortedSlots[i-1].endDate) {
            throw new ConflictError("Availability slots cannot overlap each other");
          }
        }
  
        // 3. Find overlapping bookings
        const bookingConflict = await tx.booking.findFirst({
          where: {
            propertyId,
            status: { not: "CANCELLED" },
            OR: validatedSlots.map(slot => ({
              AND: [
                { startDate: { lt: slot.endDate } },
                { endDate: { gt: slot.startDate } }
              ]
            }))
          },
          select: { id: true, startDate: true, endDate: true }
        });
  
        if (bookingConflict) {
          throw new ConflictError(
            `Conflicts with booking ${bookingConflict.id} ` +
            `(${bookingConflict.startDate.toISOString()} - ` +
            `${bookingConflict.endDate.toISOString()})`
          );
        }
  
        // 4. Atomic update in batches
        await tx.availability.deleteMany({ where: { propertyId } });
        
        const BATCH_SIZE = 100;
        for (let i = 0; i < validatedSlots.length; i += BATCH_SIZE) {
          await tx.availability.createMany({
            data: validatedSlots
              .slice(i, i + BATCH_SIZE)
              .map(slot => ({
                propertyId,
                startDate: slot.startDate,
                endDate: slot.endDate,
                price: slot.price,
                isAvailable: slot.isAvailable
              })),
            skipDuplicates: true
          });
        }
  
        // 5. Update search index after successful transaction
        // await SearchIndexService.refreshPricing(propertyId);
  
        return { success: true, updatedSlots: validatedSlots.length };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        this.handleDatabaseError(error, "Availability update failed");
      }
      throw error;
    }
  }

  /**
   * Safely delete property with archival pattern
   */
  static async deleteProperty(propertyId, ownerId = null) {
    try {
      console.log("Sanitized Property ID in service:", propertyId);

      const whereClause = {
        id: propertyId,
        status: { not: "ARCHIVED" },
      };

      if (ownerId) {
        whereClause.ownerId = ownerId;
      }

      const property = await prisma.$transaction(async (tx) => {
        // 1. Soft delete the property
        const deletedProperty = await tx.property.update({
          where: whereClause,
          data: {
            deletedAt: new Date(),
            status: "ARCHIVED",
          },
        });

        // 2. Delete related data using single transaction
        await Promise.all([
          tx.amenity.deleteMany({ where: { propertyId } }),
          tx.roomSpec.deleteMany({ where: { propertyId } }),
          tx.availability.deleteMany({ where: { propertyId } }),
        ]);

        return deletedProperty;
      });

      // 3. Clean cache and search index
      await Promise.all([
        redis.del(`property:${propertyId}`),
        // SearchIndexService.remove(propertyId),
      ]);

      return property;
    } catch (error) {
      if (error.code === "P2025") {
        throw new NotFoundError("Property not found or already deleted");
      }
      this.handleDatabaseError(error, "Property deletion failed");
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
