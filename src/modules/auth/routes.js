import express from "express";
import {
  register,
  verifyEmail,
  login,
  refreshAccessToken,
  logout,
  requestPasswordReset,
  resetPassword,
  googleAuthCallback,
  protectedRoute,
} from "./controller.js";
import authenticateJWT from "../../middlewares/authentication.js";
import passport from "passport";
const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.post("/refresh-token", refreshAccessToken);
router.post("/logout", authenticateJWT, logout);
router.get("/protected", authenticateJWT, protectedRoute);
router.get("/verify-email", verifyEmail);
router.post("/password-reset-request", requestPasswordReset);
router.post("/reset-password", resetPassword);

// Google OAuth
router.get(
  "/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);
router.get("/google/callback", googleAuthCallback);

export default router;
