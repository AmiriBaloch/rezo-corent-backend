import { Router } from "express";
import authRoutes from "./auth/routes.js";
import { authenticateUser } from "../middlewares/authentication.js";
import rolesRoutes from "./roles/routes.js";
import permissionsRoutes from "./permissions/routes.js";
import UserRoleRoutes from "./user-roles/routes.js";
import rolePermissionsRoutes from "./role-permissions/routes.js";
import propertyRoutes from "./properties/routes.js";
import messageRoutes from "./message/routes.js";
import profileRoutes from "./profile/routes.js";
const routes = Router();
routes.use("/auth", authRoutes);
routes.use("/roles", rolesRoutes);
routes.use("/permissions", permissionsRoutes);
routes.use("/user-roles", UserRoleRoutes);
routes.use("/user-permissions", rolePermissionsRoutes);
routes.use("/properties", propertyRoutes);
routes.use("/conversations", messageRoutes);
routes.use("/profile", profileRoutes);

routes.get(
  "/protected",
  authenticateUser(),
  authenticateUser({ roles: ["owner", "admin"] }),
  (req, res) => {
    res.json({
      message: "Hello World! Successfully accessed this route 🎉",
      Path: `only ${req.user.role} Can Access it`,
      user: req.user,
    });
  }
);
// routes.get("/dashboard", (req, res) => {
//   res.json({ message: "Hello World! Successfully accessed this route 🎉" });
// });
export default routes;
