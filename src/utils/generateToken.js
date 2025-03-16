import jwt from "jsonwebtoken";
import config from "../config/env.js";
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
