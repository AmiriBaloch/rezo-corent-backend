// bookings/schema.js
import Joi from 'joi';
import { BookingStatus, PropertyStatus } from '@prisma/client';
import { DateTime } from 'luxon';

// Base schema definitions
const dateSchema = Joi.date().iso().custom((value, helpers) => {
  const dt = DateTime.fromJSDate(value);
  if (!dt.isValid) {
    return helpers.error('date.invalid');
  }
  return value;
}, 'Date validation');

const uuidSchema = Joi.string().guid({
  version: ['uuidv4']
});

const moneySchema = Joi.number().precision(2).positive();

// Reusable schemas
const addressSchema = Joi.object({
  street: Joi.string().max(100).required(),
  city: Joi.string().max(50).required(),
  state: Joi.string().max(50).required(),
  postalCode: Joi.string().max(20).required(),
  country: Joi.string().length(2).required()
}).label('Address');

const dateRangeSchema = Joi.object({
  start: dateSchema.required(),
  end: dateSchema.min(Joi.ref('start')).required()
}).label('DateRange');

// Main schemas
export const createBookingSchema = Joi.object({
  propertyId: uuidSchema.required(),
  startDate: dateSchema.min('now').required(),
  endDate: dateSchema.min(Joi.ref('startDate')).required(),
  guestCount: Joi.number().integer().min(1).max(20).default(1),
  specialRequests: Joi.string().max(500).allow('').optional(),
  paymentMethodId: Joi.string().when('$immediatePayment', {
    is: true,
    then: Joi.string().required(),
    otherwise: Joi.string().optional()
  })
})
  .with('startDate', 'endDate')
  .label('CreateBookingRequest');

export const cancelBookingSchema = Joi.object({
  cancellationReason: Joi.string().max(200).required(),
  refundPreference: Joi.string().valid('original', 'credit').default('original')
}).label('CancelBookingRequest');

export const updateBookingSchema = Joi.object({
  startDate: dateSchema.min('now'),
  endDate: dateSchema.when('startDate', {
    is: Joi.exist(),
    then: Joi.date().min(Joi.ref('startDate')),
    otherwise: Joi.date().min(Joi.ref('$originalStartDate'))
  }),
  guestCount: Joi.number().integer().min(1).max(20),
  specialRequests: Joi.string().max(500).allow('')
})
  .or('startDate', 'endDate', 'guestCount', 'specialRequests')
  .label('UpdateBookingRequest');

export const bulkBookingSchema = Joi.array()
  .items(
    Joi.object({
      propertyId: uuidSchema.required(),
      dateRange: dateRangeSchema.required(),
      guestCount: Joi.number().integer().min(1).max(10).default(1)
    })
  )
  .max(10)
  .label('BulkBookingRequest');

export const availabilitySchema = Joi.object({
  propertyId: uuidSchema.required(),
  dateRange: dateRangeSchema.required(),
  includeUnavailable: Joi.boolean().default(false)
}).label('AvailabilityRequest');

// Database model validation schemas
export const bookingDbSchema = Joi.object({
  id: uuidSchema.required(),
  propertyId: uuidSchema.required(),
  tenantId: uuidSchema.required(),
  startDate: dateSchema.required(),
  endDate: dateSchema.min(Joi.ref('startDate')).required(),
  totalPrice: moneySchema.required(),
  status: Joi.string().valid(...Object.values(BookingStatus)).required(),
  createdAt: dateSchema.required(),
  updatedAt: dateSchema.min(Joi.ref('createdAt')).required()
}).label('Booking');

export const availabilityDbSchema = Joi.object({
  id: uuidSchema.required(),
  propertyId: uuidSchema.required(),
  startDate: dateSchema.required(),
  endDate: dateSchema.min(Joi.ref('startDate')).required(),
  price: moneySchema.required(),
  isAvailable: Joi.boolean().required()
}).label('Availability');

// Custom validation functions
export const validateBookingDatesAgainstProperty = (booking, property) => {
  if (property.status !== PropertyStatus.APPROVED) {
    throw new Error('Property not available for booking');
  }

  const bookingStart = DateTime.fromJSDate(booking.startDate);
  const bookingEnd = DateTime.fromJSDate(booking.endDate);
  const minStay = property.minimumStayDays || 1;

  if (bookingEnd.diff(bookingStart, 'days').days < minStay) {
    throw new Error(`Minimum stay requirement not met (${minStay} days)`);
  }
};

export const validateAgainstCancellationPolicy = (booking, policy) => {
  const now = DateTime.now();
  const checkInDate = DateTime.fromJSDate(booking.startDate);
  const hoursUntilCheckIn = checkInDate.diff(now, 'hours').hours;

  if (hoursUntilCheckIn < policy.cancellationWindowHours) {
    throw new Error('Cancellation window has passed');
  }
};

// Schema for API responses
export const bookingResponseSchema = bookingDbSchema
  .append({
    property: Joi.object({
      title: Joi.string().required(),
      address: addressSchema.required()
    }).required(),
    payment: Joi.object({
      status: Joi.string().required(),
      amount: moneySchema.required()
    }).optional()
  })
  .label('BookingResponse');

// Utility validation function
export const validateRequest = (schema, data, context = {}) => {
  const { error, value } = schema.validate(data, {
    abortEarly: false,
    allowUnknown: false,
    context
  });

  if (error) {
    const validationError = new Error('Validation failed');
    validationError.details = error.details;
    validationError.annotated = error.annotate();
    throw validationError;
  }

  return value;
};

// Export all schemas
export default {
  createBookingSchema,
  cancelBookingSchema,
  updateBookingSchema,
  bulkBookingSchema,
  availabilitySchema,
  bookingDbSchema,
  availabilityDbSchema,
  bookingResponseSchema,
  validateRequest,
  validateBookingDatesAgainstProperty,
  validateAgainstCancellationPolicy
};