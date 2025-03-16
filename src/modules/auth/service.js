import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import config from "../../config/env.js";
import {
  generateAccessToken,
  generateRefreshToken,
  generateToken,
  generateOTP,
} from "../../utils/generateToken.js";
import { sendEmail } from "../../utils/email.js";
// dotenv.config();
const prisma = new PrismaClient();
export const registerUser = async ({ email, password }) => {
  // Check if the user already exists
  const existingUser = await prisma.user.findUnique({ where: { email } });
  console.log(`${existingUser} Verify Email`);
  if (existingUser) throw new Error("Email already in use");

  // Generate OTP and hash the password
  const otp = generateOTP();
  const hashedPassword = await bcrypt.hash(password, 10);
  const emailOtpExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes expiration

  // Create the user with OTP
  const user = await prisma.user.create({
    data: {
      email,
      password: hashedPassword,
      emailOtp: otp,
      emailOtpExpires,
    },
    select: {
      id: true,
      email: true,
      createdAt: true,
    },
  });

  // Send verification email with OTP
  await sendEmail(
    email,
    "Verify Your Email Address",
    `Your verification code is: ${otp}`
  );

  return user;
};

export const verifyEmailService = async (otp) => {
  // Find user with valid OTP
  const user = await prisma.user.findFirst({
    where: {
      emailOtp: otp,
      emailOtpExpires: { gt: new Date() }, // Check if OTP is not expired
    },
  });

  if (!user) {
    throw new Error("Invalid or expired verification OTP");
  }

  // Generate tokens
  const accessToken = generateAccessToken(user.id);
  const refreshToken = generateRefreshToken(user.id);

  // Update user record
  await prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerified: true, // Mark email as verified
      emailOtp: null, // Clear OTP
      emailOtpExpires: null, // Clear OTP expiration
      refreshToken, // Store refresh token
    },
  });

  // Return tokens
  return {
    accessToken,
    refreshToken,
    user,
    // user: {
    //   id: user.id,
    //   email: user.email,
    //   emailVerified: true, // Confirm email is now verified
    // },
  };
};

export const loginUser = async (email, password) => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error("Invalid credentials");

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) throw new Error("Invalid credentials");

  const accessToken = generateAccessToken(user.id);
  const refreshToken = generateRefreshToken(user.id);

  // Save refresh token in database
  await prisma.user.update({
    where: { id: user.id },
    data: { refreshToken },
  });

  return { user, accessToken, refreshToken };
};

export const refreshToken = async (token) => {
  if (!token) throw new Error("Refresh token is required");

  const decoded = jwt.verify(token, config.get("refreshSecret"));
  const user = await prisma.user.findUnique({ where: { id: decoded.id } });

  if (!user || user.refreshToken !== token)
    throw new Error("Invalid refresh token");

  const newAccessToken = generateAccessToken(user);
  return { accessToken: newAccessToken };
};

export const logoutUser = async (userId) => {
  await prisma.user.update({
    where: { id: userId },
    data: { refreshToken: null },
  });
};

export const requestPasswordResetService = async (email) => {
  // Find user by email
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    // Return generic message to prevent email enumeration
    return {
      message: "If an account exists with this email, a reset OTP will be sent",
    };
  }

  // Generate OTP and set expiration
  const resetOTP = generateOTP();
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes expiration

  // Update user with reset OTP
  await prisma.user.update({
    where: { id: user.id },
    data: {
      resetPasswordOtp: resetOTP,
      resetPasswordOtpExpires: expiresAt,
    },
  });

  // Prepare email content
  const emailContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #2563eb;">Password Reset Request</h2>
      <p>Your password reset code is:</p>
      <div style="font-size: 24px; letter-spacing: 3px; 
           padding: 10px 20px; background: #f3f4f6; 
           display: inline-block; border-radius: 4px;">
        ${resetOTP}
      </div>
      <p style="margin-top: 20px; color: #6b7280;">
        This code will expire in 30 minutes. If you didn't request this,
        please ignore this email or contact support.
      </p>
    </div>
  `;

  // Send email
  await sendEmail(email, "Password Reset Request", emailContent);

  return {
    message: "If an account exists with this email, a reset OTP will be sent",
    success: true,
  };
};
export const resetPasswordService = async (otp, newPassword) => {
  // Validate OTP and check expiration
  const user = await prisma.user.findFirst({
    where: {
      resetPasswordOtp: otp,
      resetPasswordOtpExpires: { gt: new Date() },
    },
  });

  if (!user) {
    throw new Error("Invalid or expired OTP. Please request a new one.");
  }

  // Validate new password
  if (!newPassword || newPassword.length < 8) {
    throw new Error("Password must be at least 8 characters long");
  }

  // Hash the new password
  const hashedPassword = await bcrypt.hash(newPassword, 10);

  // Update user's password and clear reset fields
  await prisma.user.update({
    where: { id: user.id },
    data: {
      password: hashedPassword,
      resetPasswordOtp: null,
      resetPasswordOtpExpires: null,
      refreshToken: null, // Invalidate all refresh tokens
    },
  });

  // Send confirmation email
  await sendEmail(
    user.email,
    "Password Changed Successfully",
    `Your password was successfully changed on ${new Date().toLocaleString()}`
  );

  return {
    success: true,
    message:
      "Password reset successful. You can now log in with your new password.",
  };
};
