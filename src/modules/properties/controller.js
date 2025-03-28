// properties/controller.js
import { PropertyService } from "./service.js";
import { PropertySchema, AvailabilitySchema } from "./schema.js";
import { v4 as isUUID } from "uuid";

export class PropertyController {
  static async createProperty(req, res) {
    try {
      // const data = PropertySchema.parse(req.body);
      const data = req.body;
      const property = await PropertyService.createProperty(req.user.id, data);
      res.status(201).json(property);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  static async updateProperty(req, res) {
    try {
      // const data = PropertySchema.partial().parse();
      const data = req.body;
      const property = await PropertyService.updateProperty(
        req.params.id,
        req.user.id,
        data
      );
      res.json(property);
    } catch (error) {
      res.status(403).json({ error: "Update failed" });
    }
  }

  static async getProperty(req, res) {
    try {
      const property = await PropertyService.getProperty(req.params.id);
      res.json(property);
    } catch (error) {
      res.status(404).json({ error: "Property not found" });
    }
  }

  static async updateAvailability(req, res) {
    try {
      const availability = req.body;
      const propertyId = req.params.id;

      // Validate input structure
      if (!Array.isArray(availability)) {
        return res
          .status(400)
          .json({ error: "Availability data must be an array" });
      }

      // Validate each slot
      for (const slot of availability) {
        if (!slot.startDate || !slot.endDate || !slot.pricePerNight) {
          return res.status(400).json({
            error: "Missing required fields in availability slot",
            requiredFields: ["startDate", "endDate", "pricePerNight"],
          });
        }
      }

      const result = await PropertyService.updateAvailability(
        propertyId,
        availability
      );
      res.json(result);
    } catch (error) {
      console.error("Availability update error:", error);
      res.status(400).json({
        error: "Invalid availability data",
        details: error.message,
      });
    }
  }

  
  static async searchProperties(req, res) {
    try {
      const lat = parseFloat(req.query.lat);
      const lng = parseFloat(req.query.lng);
      const radius = parseInt(req.query.radius) || 5000;
      const ownerId = req.query.ownerId;

      if (isNaN(lat) || isNaN(lng)) {
        return res.status(400).json({ error: "Invalid coordinates" });
      }

      if (ownerId && !isUUID(ownerId)) {
        return res
          .status(400)
          .json({ error: "Invalid UUID format for ownerId" });
      }

      const results = await PropertyService.searchProperties({
        ...req.query,
        lat,
        lng,
        radius,
        ownerId,
      });

      res.json({
        count: results.length,
        results,
      });
    } catch (error) {
      console.error("Search error:", error);
      res.status(500).json({
        error: "Search failed",
        details: error.message,
      });
    }
  }
}
