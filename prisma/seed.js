// prisma/seed.js
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";

const prisma = new PrismaClient();
const SALT_ROUNDS = 12;

async function main() {
  try {
    // 1. Create System Roles
    const roles = await Promise.all([
      prisma.role.upsert({
        where: { name: "superAdmin" },
        update: {},
        create: {
          id: uuidv4(),
          name: "superAdmin",
          description: "Full system administrator with unrestricted access",
          isSystem: true,
          isDefault: false,
        },
      }),
      prisma.role.upsert({
        where: { name: "admin" },
        update: {},
        create: {
          id: uuidv4(),
          name: "admin",
          description: "Platform administrator with management privileges",
          isSystem: true,
          isDefault: false,
        },
      }),
      prisma.role.upsert({
        where: { name: "owner" },
        update: {},
        create: {
          id: uuidv4(),
          name: "owner",
          description: "Property owner with listing management rights",
          isSystem: false,
          isDefault: false,
        },
      }),
      prisma.role.upsert({
        where: { name: "tenant" },
        update: {},
        create: {
          id: uuidv4(),
          name: "tenant",
          description: "Rental tenant with booking capabilities",
          isSystem: false,
          isDefault: true,
        },
      }),
    ]);

    const [superAdminRole, adminRole, ownerRole, tenantRole] = roles;

    // 2. Create Permissions
    const permissions = await Promise.all([
      // Super Admin Permissions (Wildcard)
      prisma.permission.upsert({
        where: { resource_action: { resource: "*", action: "*" } },
        update: {},
        create: {
          id: uuidv4(),
          resource: "*",
          action: "*",
          description: "Full system access",
        },
      }),

      // Admin Permissions
      ...["user", "property", "booking", "payment", "review"].map((resource) =>
        prisma.permission.upsert({
          where: { resource_action: { resource, action: "manage" } },
          update: {},
          create: {
            id: uuidv4(),
            resource,
            action: "manage",
            description: `Full ${resource} management`,
          },
        })
      ),

      // Owner Permissions
      ...["property:own", "availability:own", "booking:own", "payment:own"].map(
        (resource) =>
          prisma.permission.upsert({
            where: { resource_action: { resource, action: "*" } },
            update: {},
            create: {
              id: uuidv4(),
              resource,
              action: "*",
              description: `Manage own ${resource.split(":")[0]}`,
            },
          })
      ),

      // Tenant Permissions
      ...["property:read", "booking:own", "payment:own", "review:own"].map(
        (resource) =>
          prisma.permission.upsert({
            where: { resource_action: { resource, action: "manage" } },
            update: {},
            create: {
              id: uuidv4(),
              resource,
              action: "manage",
              description: `Manage ${resource.split(":")[0]} interactions`,
            },
          })
      ),
    ]);

    // 3. Assign Permissions to Roles
    await Promise.all([
      // Super Admin gets wildcard
      prisma.rolePermission.create({
        data: {
          roleId: superAdminRole.id,
          permissionId: permissions[0].id,
          conditions: {},
        },
      }),

      // Admin gets management permissions
      ...permissions.slice(1, 6).map((permission) =>
        prisma.rolePermission.create({
          data: {
            roleId: adminRole.id,
            permissionId: permission.id,
            conditions: {},
          },
        })
      ),

      // Owner permissions
      ...permissions.slice(6, 10).map((permission) =>
        prisma.rolePermission.create({
          data: {
            roleId: ownerRole.id,
            permissionId: permission.id,
            conditions: { ownerId: `${user.id}` }, // ABAC condition
          },
        })
      ),

      // Tenant permissions
      ...permissions.slice(10).map((permission) =>
        prisma.rolePermission.create({
          data: {
            roleId: tenantRole.id,
            permissionId: permission.id,
            conditions: { tenantId: `${user.id}` }, // ABAC condition
          },
        })
      ),
    ]);

    // 4. Create Users
    const [superAdmin, admin, owner, tenant] = await Promise.all([
      // Super Admin
      prisma.user.upsert({
        where: { email: "superadmin@corent.com" },
        update: {},
        create: {
          id: uuidv4(),
          email: "superadmin@corent.com",
          passwordHash: await bcrypt.hash("Super@Admin123", SALT_ROUNDS),
          isActive: true,
          isVerified: true,
          profile: {
            create: {
              id: uuidv4(),
              firstName: "System",
              lastName: "Admin",
              gender: "MALE",
            },
          },
        },
      }),

      // Admin
      prisma.user.upsert({
        where: { email: "admin@corent.com" },
        update: {},
        create: {
          id: uuidv4(),
          email: "admin@corent.com",
          passwordHash: await bcrypt.hash("Admin@12345", SALT_ROUNDS),
          isActive: true,
          isVerified: true,
          profile: {
            create: {
              id: uuidv4(),
              firstName: "Platform",
              lastName: "Manager",
              gender: "MALE",
            },
          },
        },
      }),

      // Owner
      prisma.user.upsert({
        where: { email: "owner@corent.com" },
        update: {},
        create: {
          id: uuidv4(),
          email: "owner@corent.com",
          passwordHash: await bcrypt.hash("Owner@12345", SALT_ROUNDS),
          isActive: true,
          isVerified: true,
          profile: {
            create: {
              id: uuidv4(),
              firstName: "Property",
              lastName: "Owner",
              gender: "MALE",
            },
          },
        },
      }),

      // Tenant
      prisma.user.upsert({
        where: { email: "tenant@corent.com" },
        update: {},
        create: {
          id: uuidv4(),
          email: "tenant@corent.com",
          passwordHash: await bcrypt.hash("Tenant@12345", SALT_ROUNDS),
          isActive: true,
          isVerified: true,
          profile: {
            create: {
              id: uuidv4(),
              firstName: "Rental",
              lastName: "Tenant",
              gender: "MALE",
            },
          },
        },
      }),
    ]);

    // 5. Assign Roles to Users
    await prisma.userRole.createMany({
      data: [
        // Super Admin
        {
          userId: superAdmin.id,
          roleId: superAdminRole.id,
          assignedBy: superAdmin.id,
        },
        // Admin
        {
          userId: admin.id,
          roleId: adminRole.id,
          assignedBy: superAdmin.id,
        },
        // Owner
        {
          userId: owner.id,
          roleId: ownerRole.id,
          assignedBy: admin.id,
        },
        // Tenant
        {
          userId: tenant.id,
          roleId: tenantRole.id,
          assignedBy: admin.id,
        },
      ],
      skipDuplicates: true,
    });

    // 6. Create Casbin Policies
    await prisma.casbinRule.createMany({
      data: [
        // Default deny all
        { ptype: "p", v0: "*", v1: "*", v2: "*", v3: "deny" },

        // Super Admin - wildcard access
        { ptype: "g", v0: superAdmin.id, v1: "superAdmin", v2: "*", v3: "*" },

        // Admin Policies
        { ptype: "g", v0: admin.id, v1: "admin" },
        { ptype: "p", v0: "admin", v1: "user", v2: "manage", v3: "*" },
        { ptype: "p", v0: "admin", v1: "properties", v2: "manage", v3: "*" }, // Full management
        { ptype: "p", v0: "admin", v1: "bookings", v2: "manage", v3: "*" },
        { ptype: "p", v0: "admin", v1: "payments", v2: "manage", v3: "*" },
        { ptype: "p", v0: "admin", v1: "reviews", v2: "manage", v3: "*" },

        // Owner Policies

        // Owner Policies - Add explicit create permission
        { ptype: "p", v0: "owner", v1: "properties", v2: "create" },

        // Keep the existing manage permission
        {
          ptype: "p",
          v0: "owner",
          v1: "properties",
          v2: "manage",
          v3: "${resource.ownerId} == ${user.id}",
        },
        {
          ptype: "p",
          v0: "owner",
          v1: "properties",
          v2: "update",
          v3: "${resource.ownerId} == ${user.id}",
        },
        { ptype: "g", v0: owner.id, v1: "owner" },
        {
          ptype: "p",
          v0: "owner",
          v1: "properties",
          v2: "manage",
          v3: "${resource.ownerId} == ${user.id}",
        },
        {
          ptype: "p",
          v0: "owner",
          v1: "availability",
          v2: "manage",
          v3: "${resource.ownerId} == ${user.id}",
        },
        {
          ptype: "p",
          v0: "owner",
          v1: "bookings",
          v2: "read",
          v3: "${resource.ownerId} == ${user.id}",
        },

        // Tenant Policies
        { ptype: "g", v0: tenant.id, v1: "tenant" },
        { ptype: "p", v0: "tenant", v1: "properties", v2: "read", v3: "*" },
        {
          ptype: "p",
          v0: "tenant",
          v1: "bookings",
          v2: "manage",
          v3: "${user.id} == ${resource.tenantId}",
        },
        {
          ptype: "p",
          v0: "tenant",
          v1: "payments",
          v2: "manage",
          v3: "${user.id} == ${resource.tenantId}",
        },
        {
          ptype: "p",
          v0: "tenant",
          v1: "reviews",
          v2: "manage",
          v3: "${user.id} == ${resource.tenantId}",
        },
      ],
      skipDuplicates: true,
    });

    console.log("✅ Database seeded successfully");
  } catch (error) {
    console.error("❌ Seeding failed:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
