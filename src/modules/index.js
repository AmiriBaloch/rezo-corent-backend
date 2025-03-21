import { Router } from "express";
import authRoutes from "./auth/routes.js";
import authenticateJWT from "../middlewares/authentication.js";
const routes = Router();
routes.use("/auth", authRoutes);
routes.get("/protected", authenticateJWT, (req, res) => {
  res.json({ message: "Hello World! Successfully accessed this route 🎉" });
});
routes.get("/dashboard", (req, res) => {
  res.json({ message: "Hello World! Successfully accessed this route 🎉" });
});
export default routes;
