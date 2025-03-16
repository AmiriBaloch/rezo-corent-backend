import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import config from "../../config/env.js";
import {
  generateAccessToken,
  generateRefreshToken,
  generateToken,
} from "../../utils/generateToken.js";
import { sendEmail } from "../../utils/email.js";
// dotenv.config();
const prisma = new PrismaClient();

export const registerUser = async (email, password) => {
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) throw new Error("Email already in use");
  const verificationToken = generateToken();
  const hashedPassword = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { email, password: hashedPassword, verificationToken },
  });
  const verificationLink = `${config.get(
    "frontendUrl"
  )}/verify-email?token=${verificationToken}`;
  await sendEmail(
    email,
    "Verify Your Email",
    `<a href="${verificationLink}">Click to Verify</a>`
  );
  const accessToken = generateAccessToken(user.id);
  const refreshToken = generateRefreshToken(user.id);
  return user, accessToken, refreshToken;
};

export const verifyEmailService = async (token) => {
  const user = await prisma.user.findFirst({
    where: { verificationToken: token },
  });
  if (!user) throw new Error("Invalid verification token");

  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerified: true, verificationToken: null },
  });

  return { message: "Email verified successfully" };
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
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error("User not found");

  const resetToken = generateToken();
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);// Expires in 30 minutes

  await prisma.user.update({
    where: { id: user.id },
    data: { resetPasswordToken: resetToken, resetPasswordExpires: expiresAt },
  });

  const resetLink = `${config.get(
    "frontendUrl"
  )}/reset-password?token=${resetToken}`;
  await sendEmail(
    email,
    "Reset Your Password",
    `<a href="${resetLink}">Reset Password</a>`
  );

  return { message: "Password reset email sent successfully" };
};

export const resetPasswordService = async (token, newPassword) => {
  const user = await prisma.user.findFirst({
    where: { resetPasswordToken: token },
  });

  if (!user) throw new Error("Invalid or expired token");

  // Ensure resetPasswordExpires exists and is still valid
  if (!user.resetPasswordExpires || new Date(user.resetPasswordExpires) < new Date()) {
    throw new Error("Reset token has expired. Please request a new one.");
  }

  // Hash the new password
  const hashedPassword = await bcrypt.hash(newPassword, 10);

  // Update user's password and clear reset fields
  await prisma.user.update({
    where: { id: user.id },
    data: {
      password: hashedPassword,
      resetPasswordToken: null,
      resetPasswordExpires: null,
    },
  });

  return { message: "Password reset successful. You can now log in with your new password." };
};