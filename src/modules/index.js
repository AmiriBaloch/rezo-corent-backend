import { Router } from "express";
import authRoutes from "./auth/routes.js";
import rolesRoutes from "./roles/routes.js";
import authenticateJWT from "../middlewares/authentication.js";
import permissionsRoutes from "./permissions/routes.js";
import UserRoleRoutes from "./user-roles/routes.js";
import rolePermissionsRoutes from "./role-permissions/routes.js";
const routes = Router();
routes.use("/auth", authRoutes);
routes.use("/roles", rolesRoutes);
routes.use("/permissions", permissionsRoutes);
routes.use("/user-roles", UserRoleRoutes);
routes.use("/user-permissions", rolePermissionsRoutes);

routes.get("/protected", authenticateJWT, (req, res) => {
  res.json({ message: "Hello World! Successfully accessed this route 🎉" });
});
routes.get("/dashboard", (req, res) => {
  res.json({ message: "Hello World! Successfully accessed this route 🎉" });
});
export default routes;
