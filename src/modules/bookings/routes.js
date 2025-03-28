// bookings/routes.js
import express from 'express';
import {createBooking} from './controller.js';
import {authenticateUser} from '../../middlewares/authentication.js';
import {canCreateBooking} from './policy.js';
import { validate } from '../../middleware/validate.js';
import {
  createBookingSchema,
  cancelBookingSchema,
  availabilitySchema,
  bulkBookingSchema
} from './schema.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();

// Rate limiting for critical endpoints
const bookingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many booking attempts, please try again later'
});

// Create Booking
router.post('/',
  authenticateUser(),
  canCreateBooking(),
  // validate(createBookingSchema),
  bookingLimiter,
  createBooking()
);

// Cancel Booking
// router.put('/:id/cancel',
//   authMiddleware,
//   bookingPolicy.canModifyBooking,
//   validate(cancelBookingSchema),
//   controller.cancelBooking
// );

// Get Booking Details
// router.get('/:id',
//   authMiddleware,
//   bookingPolicy.canViewBooking,
//   controller.getBooking
// );

// Check Availability
// router.post('/availability',
//   authMiddleware,
//   bookingPolicy.canViewProperty,
//   validate(availabilitySchema),
//   controller.checkAvailability
// );

// Bulk Booking Operations
const bulkLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // Limit to 5 bulk operations per hour
  message: 'Too many bulk operations, please try again later'
});

// router.post('/bulk',
//   authMiddleware,
//   bookingPolicy.canCreateBooking,
//   validate(bulkBookingSchema),
//   bulkLimiter,
//   controller.processBulkBookings
// );

// New endpoint: List User Bookings
// router.get('/',
//   authMiddleware,
//   bookingPolicy.canViewBookings,
//   controller.listUserBookings
// );

export default router;