import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import config from "../../config/env.js";
import {
  generateAccessToken,
  generateRefreshToken,
  generateOTP,
} from "../../utils/generateToken.js";
import { sendEmail } from "../../utils/email.js";
import logger from "../../config/logger.js";
import {
  ConflictError,
  ValidationError,
  AuthError,
} from "../../utils/apiError.js";

const PASSWORD_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
const prisma = new PrismaClient();

export const registerUser = async ({ email, password }) => {
  // if (!PASSWORD_REGEX.test(password)) {
  //   throw new ValidationError("Password must contain 8+ chars with uppercase, lowercase, number, and special character");
  // }

  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existingUser) {
    logger.warn(`Registration attempt with existing email: ${email}`);
    throw new ConflictError("Email already registered");
  }

  // Hash password and OTP
  const hashedPassword = await bcrypt.hash(password, 12);
  const otp = generateOTP();

  // Create user with OTP verification
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: hashedPassword,
      otpVerifications: {
        create: {
          type: "EMAIL_VERIFICATION",
          code: otp,
          expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        },
      },
    },
    select: { id: true, email: true, createdAt: true },
  });

  // Send verification email
  await sendEmail(
    email,
    "Verify Your Email",
    `Your verification code is: ${otp}`,
    `<strong>${otp}</strong>`
  ).catch((error) => {
    logger.error(`Email send failed: ${error.message}`);
    throw new Error("Failed to send verification email");
  });

  return user;
};

export const verifyEmailService = async (code, context) => {
  // Find valid OTP verification
  const verification = await prisma.oTPVerification.findFirst({
    where: {
      code: { equals: code },
      type: "EMAIL_VERIFICATION",
      expiresAt: { gt: new Date() },
      attempts: { lt: 3 },
    },
    include: { user: true },
  });

  if (!verification) {
    throw new ValidationError("Invalid or expired verification code");
  }

  // Update verification attempts
  await prisma.oTPVerification.update({
    where: { id: verification.id },
    data: { attempts: { increment: 1 } },
  });

  // Verify user email
  const user = await prisma.user.update({
    where: { id: verification.user.id },
    data: { isVerified: true },
    select: {
      id: true,
      email: true,
      isVerified: true,
      roles: true,
    },
  });

  // Create session
  const [accessToken, refreshToken] = await Promise.all([
    generateAccessToken(user.id, roles),
    generateRefreshToken(user.id, roles),
  ]);

  await prisma.session.create({
    data: {
      userId: user.id,
      sessionToken: accessToken,
      refreshToken,
      expiresAt: new Date(
        Date.now() + config.get("jwtRefreshExpiration") * 1000
      ),
      deviceInfo: context.deviceInfo,
      ipAddress: context.ipAddress,
    },
  });

  // Cleanup OTP
  await prisma.oTPVerification.deleteMany({
    where: { userId: user.id, type: "EMAIL_VERIFICATION" },
  });

  return { accessToken, refreshToken, user };
};

export const loginUser = async (email, password, context) => {
  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      passwordHash: true,
      isActive: true,
      isVerified: true,
      mfaEnabled: true,
    },
  });

  if (!user) {
    logger.warn(`Login attempt for non-existent user: ${email}`);
    throw new AuthError("Invalid credentials");
  }

  if (!user.isActive) throw new AuthError("Account deactivated");
  if (!user.isVerified) throw new AuthError("Account not verified");

  const passwordValid = await bcrypt.compare(password, user.passwordHash);
  if (!passwordValid) {
    logger.warn(`Invalid password attempt for: ${email}`);
    throw new AuthError("Invalid credentials");
  }

  // Handle MFA if enabled
  if (user.mfaEnabled) {
    const otp = await bcrypt.hash(generateOTP(), 6);
    await prisma.otpVerification.create({
      data: {
        userId: user.id,
        type: "LOGIN_2FA",
        code: otp,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    });

    await sendEmail(email, "2FA Login Code", `Your code is: ${otp}`);
    return { mfaRequired: true };
  }

  // Create new session
  const [accessToken, refreshToken] = await Promise.all([
    generateAccessToken(user.id),
    generateRefreshToken(user.id),
  ]);

  const newSession = await prisma.session.create({
    data: {
      userId: user.id,
      sessionToken: accessToken,
      refreshToken,
      expiresAt: new Date(
        Date.now() + config.get("jwtRefreshExpiration") * 1000
      ),
      deviceInfo: context.deviceInfo,
      ipAddress: context.ipAddress,
    },
    select: { id: true },
  });

  return {
    accessToken,
    refreshToken,
    sessionId: newSession.id,
    user: await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        email: true,
        isVerified: true,
      },
    }),
  };
};

export const refreshToken = async (token, context) => {
  let decoded;
  try {
    decoded = jwt.verify(token, config.get("refreshSecret"), {
      algorithms: ["HS256"],
      issuer: config.get("jwtIssuer"),
      audience: config.get("jwtAudience"),
    });
  } catch (error) {
    logger.error(`JWT verification failed: ${error.message}`);
    throw new AuthError("Invalid or expired refresh token");
  }

  const session = await prisma.session.findFirst({
    where: { userId: decoded.sub, refreshToken: token },
    include: { user: true },
  });

  if (!session || session.user.id !== decoded.sub) {
    throw new AuthError("Invalid refresh token");
  }

  // Rotate tokens
  // ✅ Rotate tokens securely
  const newAccessToken = generateAccessToken(
    session.user.id,
    session.user.roles
  );
  const newRefreshToken = generateRefreshToken(
    session.user.id,
    session.user.roles
  );

  await prisma.session.update({
    where: { id: session.id },
    data: {
      sessionToken: newAccessToken,
      refreshToken: newRefreshToken,
      expiresAt: new Date(
        Date.now() + config.get("jwtRefreshExpiration") * 1000
      ),
      ipAddress: context.ipAddress,
      deviceInfo: context.deviceInfo,
    },
  });

  return { accessToken: newAccessToken, refreshToken: newRefreshToken };
};

export const logoutUser = async (userId, sessionId) => {
  await prisma.session.deleteMany({
    where: { userId, id: sessionId },
  });
};

export const requestPasswordResetService = async (email) => {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (!user) {
    logger.info(`Password reset request for unknown email: ${email}`);
    return { message: "If account exists, reset instructions sent" };
  }

  const existingOTP = await prisma.oTPVerification.findFirst({
    where: {
      userId: user.id,
      type: "PASSWORD_RESET",
    },
  });

  const otp = generateOTP();

  if (existingOTP) {
    await prisma.oTPVerification.update({
      where: { id: existingOTP.id },
      data: {
        code: otp,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        attempts: 0,
      },
    });
  } else {
    await prisma.oTPVerification.create({
      data: {
        userId: user.id,
        type: "PASSWORD_RESET",
        code: otp,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });
  }

  try {
    await sendEmail(
      email,
      "Password Reset Code",
      `Your reset code is: ${otp}`,
      `<strong>${otp}</strong>`
    );
  } catch (error) {
    logger.error(`Failed to send password reset email: ${error.message}`);
    throw new Error("Failed to send password reset email");
  }

  return { message: "If account exists, reset instructions sent" };
};

export const resetPasswordService = async (code, newPassword, context) => {
  // if (!PASSWORD_REGEX.test(newPassword)) {
  //   throw new ValidationError("Password must meet complexity requirements");
  // }

  const verification = await prisma.oTPVerification.findFirst({
    where: {
      code: { equals: code },
      type: "PASSWORD_RESET",
      expiresAt: { gt: new Date() },
      attempts: { lt: 3 },
    },
    include: { user: true },
  });

  if (!verification) {
    throw new ValidationError("Invalid or expired reset code");
  }

  const hashedPassword = await bcrypt.hash(newPassword, 12);

  await Promise.all([
    prisma.user.update({
      where: { id: verification.user.id },
      data: { passwordHash: hashedPassword },
    }),
    prisma.oTPVerification.deleteMany({
      where: { userId: verification.user.id, type: "PASSWORD_RESET" },
    }),
    prisma.session.deleteMany({
      where: { userId: verification.user.id },
    }),
  ]);

  await sendEmail(
    verification.user.email,
    "Password Changed",
    `Password changed from ${context.ipAddress}`,
    `<p>Changed from IP: ${context.ipAddress}</p>`
  );

  return { success: true };
};
