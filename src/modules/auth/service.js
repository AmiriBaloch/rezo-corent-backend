import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import config from "../../config/env.js";
import {
  generateAccessToken,
  generateRefreshToken,
} from "../../utils/generateToken.js";

// dotenv.config();
const prisma = new PrismaClient();

const generateToken = (user) => {
  return jwt.sign({ id: user.id, email: user.email }, config.get("jwtSecret"), {
    expiresIn: "1h",
  });
};

export const registerUser = async (email, password) => {
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) throw new Error("Email already in use");

  const hashedPassword = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { email, password: hashedPassword },
  });

  return generateToken(user), user;
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
