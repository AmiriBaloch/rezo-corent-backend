import express from "express";
import { login, register, protectedRoute } from "./controller.js";
import authenticateJWT from "../../middlewares/authentication.js";

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.get("/protected", authenticateJWT, protectedRoute);

export default router;
