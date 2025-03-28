// bookings/service.js
import prisma from "../../config/database.js";
import { DateTime, Interval } from "luxon";
import redis from "../../config/redis.js";
import notificationService from "../notifications/service.js";
import paymentService from "../payments/service.js";
import {
  BookingError,
  ConflictError,
  NotFoundError,
} from "../../utils/apiError.js";
import logger from "../../config/logger.js";

class BookingService {
  constructor() {
    this.LOCK_TIMEOUT = 5000; // 5 seconds
    this.CANCELLATION_WINDOW = 48; // hours
    this.MAX_BULK_CONCURRENCY = 5;
  }

  // Core booking creation with transaction locking
  async createBooking({ propertyId, userId, startDate, endDate }) {
    const propertyLockKey = `property:${propertyId}:lock`;

    return await prisma.$transaction(async (tx) => {
      // Acquire distributed lock
      const lock = await redis.set(
        propertyLockKey,
        "locked",
        "PX",
        this.LOCK_TIMEOUT,
        "NX"
      );
      if (!lock)
        throw new ConflictError("Property is currently being modified");

      try {
        const availability = await this.checkAvailabilityWithLock(
          tx,
          propertyId,
          startDate,
          endDate
        );
        const totalPrice = this.calculateTotalPrice(
          availability,
          startDate,
          endDate
        );

        const booking = await tx.booking.create({
          data: {
            propertyId,
            tenantId: userId,
            startDate,
            endDate,
            totalPrice,
            status: "PENDING",
            payment: {
              create: {
                amount: totalPrice,
                currency: "USD",
                status: "PENDING",
              },
            },
          },
          include: {
            property: true,
            payment: true,
          },
        });

        await this.updateAvailabilitySlots(tx, propertyId, startDate, endDate);
        await notificationService.queueBookingConfirmation(booking);

        logger.info(`Booking created: ${booking.id}`);
        return booking;
      } finally {
        await redis.del(propertyLockKey);
      }
    });
  }

  // Atomic cancellation with fee calculation
  async cancelBooking({ bookingId, userId }) {
    return await prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        include: {
          payment: true,
          property: {
            select: {
              cancellationPolicy: true,
            },
          },
        },
      });

      if (!booking) throw new NotFoundError("Booking not found");
      if (booking.tenantId !== userId) throw new BookingError("Unauthorized");

      this.validateStateTransition(booking.status, "CANCELLED");
      const cancellationFee = this.calculateCancellationFee(booking);

      const [updatedBooking] = await Promise.all([
        tx.booking.update({
          where: { id: bookingId },
          data: {
            status: "CANCELLED",
            payment: {
              update: {
                status: "REFUNDED",
                refundAmount: booking.payment.amount - cancellationFee,
              },
            },
          },
        }),
        this.releaseAvailabilitySlots(
          tx,
          booking.propertyId,
          booking.startDate,
          booking.endDate
        ),
      ]);

      await notificationService.queueCancellationNotice(updatedBooking);
      logger.info(`Booking cancelled: ${bookingId}`);

      return updatedBooking;
    });
  }

  // Availability checking with lock
  async checkAvailabilityWithLock(tx, propertyId, start, end) {
    const availability = await tx.availability.findMany({
      where: {
        propertyId,
        startDate: { lte: end },
        endDate: { gte: start },
        isAvailable: true,
      },
    });

    const bookingInterval = Interval.fromDateTimes(
      DateTime.fromJSDate(start),
      DateTime.fromJSDate(end)
    );

    for (const slot of availability) {
      const slotInterval = Interval.fromDateTimes(
        DateTime.fromJSDate(slot.startDate),
        DateTime.fromJSDate(slot.endDate)
      );

      if (!bookingInterval.engulfs(slotInterval)) {
        throw new ConflictError("Requested dates not fully available");
      }
    }

    if (availability.length === 0) {
      throw new ConflictError("No availability for selected dates");
    }

    return availability;
  }

  // Update availability slots
  async updateAvailabilitySlots(tx, propertyId, start, end) {
    const days = Interval.fromDateTimes(
      DateTime.fromJSDate(start),
      DateTime.fromJSDate(end)
    )
      .splitBy({ days: 1 })
      .map((d) => d.start.toJSDate());

    for (const day of days) {
      await tx.availability.updateMany({
        where: {
          propertyId,
          startDate: { lte: day },
          endDate: { gte: day },
          isAvailable: true,
        },
        data: { isAvailable: false },
      });
    }
  }

  // Release availability on cancellation
  async releaseAvailabilitySlots(tx, propertyId, start, end) {
    await tx.availability.updateMany({
      where: {
        propertyId,
        startDate: { gte: start },
        endDate: { lte: end },
      },
      data: { isAvailable: true },
    });
  }

  // Price calculation
  calculateTotalPrice(availability, startDate, endDate) {
    const start = DateTime.fromJSDate(startDate);
    const end = DateTime.fromJSDate(endDate);
    let total = 0;

    for (let day = start; day < end; day = day.plus({ days: 1 })) {
      const dailyRate =
        availability.find(
          (slot) =>
            day >= DateTime.fromJSDate(slot.startDate) &&
            day < DateTime.fromJSDate(slot.endDate)
        )?.price || 0;

      total += Number(dailyRate);
    }

    return total;
  }

  // Cancellation fee calculation
  calculateCancellationFee(booking) {
    const policy = booking.property.cancellationPolicy || {};
    const hoursUntilCheckin = DateTime.fromJSDate(booking.startDate).diffNow(
      "hours"
    ).hours;

    if (
      hoursUntilCheckin <
      (policy.cancellationWindowHours || this.CANCELLATION_WINDOW)
    ) {
      return booking.totalPrice * (policy.feePercentage || 0.5);
    }
    return 0;
  }

  // Bulk booking processing with concurrency control
  async processBulkBookings(requests, userId) {
    const { default: PQueue } = await import("p-queue");
    const queue = new PQueue({ concurrency: this.MAX_BULK_CONCURRENCY });

    const results = await Promise.allSettled(
      requests.map((req) =>
        queue.add(() =>
          this.createBooking({ ...req, userId })
            .then((value) => ({ success: true, value }))
            .catch((error) => ({ success: false, error }))
        )
      )
    );

    return results.map((result) =>
      result.status === "fulfilled" ? result.value : result.reason
    );
  }

  // State transition validation
  validateStateTransition(currentStatus, newStatus) {
    const validTransitions = {
      PENDING: ["CONFIRMED", "CANCELLED"],
      CONFIRMED: ["COMPLETED", "CANCELLED"],
      CANCELLED: [],
      COMPLETED: [],
    };

    if (!validTransitions[currentStatus]?.includes(newStatus)) {
      throw new BookingError(
        `Invalid status transition: ${currentStatus} → ${newStatus}`
      );
    }
  }
}

export default new BookingService();
