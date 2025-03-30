// properties/routes.js
import { Router } from "express";
import { PropertyController } from "./controller.js";
import {
  authenticateUser,
  authorizeAccess,
} from "../../middlewares/authentication.js";
import prisma from "../../config/database.js";

const router = Router();
// Public routes
router.get("/:id", PropertyController.getProperty);
router.get("/", PropertyController.listApprovedProperties);
// Owner access own properties
router.get(
  "/owners-properties/:ownerId",
  authenticateUser(),
  PropertyController.getPublicOwnerProperties
);
router.get(
  "/owners/:ownerId/",
  authenticateUser(),
  (req, res, next) => {
    // First try with create permission
    authorizeAccess("properties", "create")(req, res, (err) => {
      if (err) {
        // If create fails, try with manage permission
        authorizeAccess("properties", "manage")(req, res, next);
      } else {
        next();
      }
    });
  },
  PropertyController.getOwnerProperties
);
// Property owner routes
router.post(
  "/",
  authenticateUser(),
  (req, res, next) => {
    // First try with create permission
    authorizeAccess("properties", "create")(req, res, (err) => {
      if (err) {
        // If create fails, try with manage permission
        authorizeAccess("properties", "manage")(req, res, next);
      } else {
        next();
      }
    });
  },
  PropertyController.createProperty
);

router.delete(
  "/:id",
  authenticateUser(),
  (req, res, next) => {
    // First try with create permission
    authorizeAccess("properties", "create")(req, res, (err) => {
      if (err) {
        // If create fails, try with manage permission
        authorizeAccess("properties", "manage")(req, res, next);
      } else {
        next();
      }
    });
  },
  PropertyController.deleteProperty
);
router.put(
  "/:id",
  authenticateUser(),
  // authorizeAccess("properties", "manage"),
  PropertyController.updateProperty
);

// router.put(
//   "/:id",
//   authenticateUser(),
//   authorizeAccess("properties", "manage", {
//     resourceOwnerId: async (req) => {
//       console.log(
//         "Checking the request ===========> \n",
//         req,
//         "\n =========================="
//       );
//       const property = await prisma.property.findUnique({
//         where: { id: req.params.id },
//         select: { ownerId: true },
//       });

//       if (!property) throw new Error("Property not found");
//       return property.ownerId;
//     },
//   }),
//   PropertyController.updateProperty
// );

router.patch(
  "/:id/availability",
  authenticateUser(),
  authorizeAccess("properties", "manage", {
    resourceOwnerId: async (req) => {
      const property = await prisma.property.findUnique({
        where: { id: req.params.id },
      });
      return property?.ownerId;
    },
  }),
  PropertyController.updateAvailability
);

// router.get(
//   "/search",
//   (req, res, next) => {
//     // Basic validation middleware
//     if (!req.query.lat || !req.query.lng) {
//       return res.status(400).json({ error: "Missing coordinates" });
//     }
//     next();
//   },
//   PropertyController.searchProperties
// ); // Serach is not working

// Admin routes

router.patch(
  "/:id/status",
  authenticateUser(),
  authorizeAccess("properties", "manage"),
  async (req, res) => {
    try {
      const { status } = req.body;
      const propertyId = req.params.id;
      // Check if property exists before updating
      const existingProperty = await prisma.property.findUnique({
        where: { id: propertyId },
      });
      if (!existingProperty) {
        return res.status(404).json({ error: "Property not found" });
      }

      const property = await prisma.property.update({
        where: { id: propertyId },
        data: { status },
      });

      res.json(property);
    } catch (error) {
      console.error("Update Error:", error);
      res
        .status(400)
        .json({ error: "Status update failed", details: error.message });
    }
  }
);

export default router;
