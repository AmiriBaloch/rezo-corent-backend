import express from "express";
import {
  login,
  register,
  protectedRoute,
  refreshAccessToken,
  logout,
} from "./controller.js";
import authenticateJWT from "../../middlewares/authentication.js";

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.post("/refresh-token", refreshAccessToken);
router.post("/logout", authenticateJWT, logout);
router.get("/protected", authenticateJWT, protectedRoute);

export default router;
