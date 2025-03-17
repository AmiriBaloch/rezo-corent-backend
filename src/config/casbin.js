// config/casbin.js
import { newEnforcer } from "casbin";
import { PrismaAdapter } from "casbin-prisma-adapter";
import path from "path";
import config from "./env.js"; // Make sure to import your config

// Cache the enforcer promise for singleton use
let enforcerPromise = null;

// Production-ready Casbin initialization
export const initializeCasbin = async () => {
  if (enforcerPromise) return enforcerPromise; // Prevent reinitialization

  enforcerPromise = (async () => {
    try {
      const adapter = await PrismaAdapter.newAdapter({
        datasourceUrl: config.get("databaseUrl"),
      });

      const modelPath = path.resolve("./src/config/casbin/model.conf");
      const enforcer = await newEnforcer(modelPath, adapter);
      await enforcer.addPolicies([
        ["systemAdmin", "*", "*"], // Allow all actions on all resources
        ["user", "/protected", "read"], // Example user policy
      ]);
      await enforcer.addGroupingPolicy(
        "64ac4941-8bea-4ac0-a623-0b1a164edbbe",
        "systemAdmin"
      );
      console.log(await enforcer.getPolicy());
      const roles = await enforcer.getRolesForUser(
        "64ac4941-8bea-4ac0-a623-0b1a164edbbe"
      );
      console.log("User roles:", roles);
      if (!enforcer.getModel()) throw new Error("Failed to load Casbin model");
      const policies = await enforcer.getNamedPolicy("p");
      if (!policies.some((p) => p[1] === "*")) {
        logger.error("No fallback policy found");
        throw new Error("Missing default policy");
      }
      enforcer.enableAutoSave(true);

      if (config.get("env") === "production") {
        setInterval(async () => {
          await enforcer.loadPolicy();
        }, 300000);
      }

      return enforcer;
    } catch (error) {
      console.error("Casbin initialization failed:", error);
      enforcerPromise = null; // ✅ Reset the singleton so it can retry later
      process.exit(1);
    }
  })();

  return enforcerPromise;
};

// RBAC helper functions with error handling
export const casbinRBAC = {
  getRolesForUser: async (userId) => {
    try {
      const enforcer = await initializeCasbin();
      const roles = await enforcer.getRolesForUser(userId);
      return roles.length ? roles : ["guest"]; // ✅ Return a default role if empty
    } catch (error) {
      console.error("Role retrieval failed:", error);
      return ["guest"]; // ✅ Return a fallback role instead of crashing
    }
  },

  getPermissions: async (userId) => {
    try {
      const enforcer = await initializeCasbin();
      return enforcer.getImplicitPermissionsForUser(userId);
    } catch (error) {
      console.error("Permission retrieval failed:", error);
      return [];
    }
  },

  hasAccess: async (userId, resource, action) => {
    try {
      const enforcer = await initializeCasbin();
      return enforcer.enforce(userId, resource, action);
    } catch (error) {
      console.error("Access check failed:", error);
      return false;
    }
  },
};
initializeCasbin().then((enforcer) => {
  console.log("Casbin policy loaded successfully");

  // Add proper environment check
  if (config.get("env") === "development") {
    enforcer.enableLog(true);
    console.log("Casbin request logging enabled");
  }
});
