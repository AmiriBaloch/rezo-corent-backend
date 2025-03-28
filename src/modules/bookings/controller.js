// bookings/controller.js
import * as service from './service.js';
import { validateRequest } from './validation.js';
import { NotFoundError } from '../../utils/apiError.js';
import logger from '../../config/logger.js';

export const createBooking = async (req, res, next) => {
  try {
    const rawData = await validateRequest('CREATE_BOOKING', req.body);
    
    // Convert dates to JS Date objects
    const bookingData = {
      ...rawData,
      startDate: new Date(rawData.startDate),
      endDate: new Date(rawData.endDate),
      userId: req.user.id
    };

    const result = await service.createBooking(bookingData);
    
    res.status(201).json({
      success: true,
      data: result,
      message: 'Booking created successfully'
    });
  } catch (error) {
    logger.error(`Booking creation failed: ${error.message}`);
    next(error);
  }
};

export const cancelBooking = async (req, res, next) => {
  try {
    const result = await service.cancelBooking({
      bookingId: req.params.id,
      userId: req.user.id
    });
    
    res.json({
      success: true,
      data: result,
      message: 'Booking cancelled successfully'
    });
  } catch (error) {
    if (error instanceof NotFoundError) {
      logger.warn(`Booking not found: ${req.params.id}`);
      return res.status(404).json({
        success: false,
        error: 'Booking not found'
      });
    }
    next(error);
  }
};

export const getBooking = async (req, res, next) => {
  try {
    const booking = await service.getBookingById(req.params.id, req.user.id);
    
    if (!booking) {
      throw new NotFoundError('Booking not found');
    }
    
    // Authorization check
    if (booking.tenantId !== req.user.id && booking.property.ownerId !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized access to booking'
      });
    }
    
    res.json({
      success: true,
      data: booking
    });
  } catch (error) {
    next(error);
  }
};

export const checkAvailability = async (req, res, next) => {
  try {
    const validated = await validateRequest('AVAILABILITY_CHECK', req.body);
    
    const availability = await service.checkPropertyAvailability(
      validated.propertyId,
      {
        start: new Date(validated.dateRange.start),
        end: new Date(validated.dateRange.end)
      }
    );
    
    res.json({
      success: true,
      data: availability,
      available: availability.length > 0
    });
  } catch (error) {
    logger.error(`Availability check failed: ${error.message}`);
    next(error);
  }
};

export const processBulkBookings = async (req, res, next) => {
  try {
    const validated = await validateRequest('BULK_BOOKINGS', req.body);
    
    const results = await service.processBulkBookings(
      validated.requests.map(r => ({
        ...r,
        startDate: new Date(r.startDate),
        endDate: new Date(r.endDate)
      })),
      req.user.id
    );
    
    const response = {
      successCount: results.filter(r => r.success).length,
      failureCount: results.filter(r => !r.success).length,
      results: results.map(r => ({
        success: r.success,
        data: r.success ? r.value : null,
        error: !r.success ? r.error.message : null
      }))
    };
    
    res.status(207).json(response);
  } catch (error) {
    logger.error(`Bulk booking failed: ${error.message}`);
    next(error);
  }
};

// Add this to service.js if not existing
export const getBookingById = async (bookingId, userId) => {
  return await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      property: {
        select: {
          id: true,
          title: true,
          ownerId: true,
          cancellationPolicy: true
        }
      },
      payment: true
    }
  });
};