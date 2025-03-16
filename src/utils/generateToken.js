import jwt from "jsonwebtoken";
import config from "../config/env.js";
import crypto from "crypto";
export const generateAccessToken = (userId) => {
  return jwt.sign({ id: userId }, config.get("jwtSecret"), {
    expiresIn: "15m",
  }); // Short-lived
};

export const generateRefreshToken = (userId) => {
  return jwt.sign({ id: userId }, config.get("refreshSecret"), {
    expiresIn: "7d",
  }); // Long-lived
};

export const generateToken = (length = 32) =>
  crypto.randomBytes(length).toString("hex");

export const generateOTP = () =>
  Math.floor(100000 + Math.random() * 900000).toString();
