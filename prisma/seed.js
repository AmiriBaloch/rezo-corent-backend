// prisma/seed.js
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();
const SALT_ROUNDS = 12;

async function seedSystemAdmin() {
  try {
    await prisma.$transaction(async (tx) => {
      // 1. Create or get admin role with all permissions
      const adminRole = await tx.role.upsert({
        where: { name: 'systemAdmin' },
        update: {},
        create: {
          id: uuidv4(),
          name: 'systemAdmin',
          description: 'Full system administrator with unrestricted access',
          isSystem: true,
          isDefault: false,
        },
      });

      // 2. Create wildcard permission (if using RBAC with wildcards)
      const wildcardPermission = await tx.permission.upsert({
        where: { resource_action: { resource: '*', action: '*' } },
        update: {},
        create: {
          id: uuidv4(),
          resource: '*',
          action: '*',
          description: 'Full access to all resources',
        },
      });

      // 3. Connect permission to role
      await tx.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: adminRole.id, permissionId: wildcardPermission.id } },
        update: {},
        create: {
          roleId: adminRole.id,
          permissionId: wildcardPermission.id,
          conditions: {},
        },
      });

      // 4. Create admin user
      const hashedPassword = await bcrypt.hash('@SuperAdmin__123', SALT_ROUNDS);
      const adminUser = await tx.user.upsert({
        where: { email: 'admin@system.com' },
        update: {},
        create: {
          id: uuidv4(),
          email: 'admin@system.com',
          passwordHash: hashedPassword,
          isActive: true,
          isVerified: true,
          profile: {
            create: {
              id: uuidv4(),
              firstName: 'System',
              lastName: 'Administrator',
            },
          },
        },
      });

      // 5. Assign admin role to user
      await tx.userRole.upsert({
        where: { userId_roleId: { userId: adminUser.id, roleId: adminRole.id } },
        update: {},
        create: {
          userId: adminUser.id,
          roleId: adminRole.id,
          assignedBy: adminUser.id,
        },
      });

      // 6. Create Casbin policy for admin role
      await tx.casbinRule.createMany({
        data: [
          // Grant all permissions to systemAdmin role
          { ptype: 'p', v0: 'systemAdmin', v1: '*', v2: '*' },
          // Assign role to user
          { ptype: 'g', v0: adminUser.id, v1: 'systemAdmin' },
        ],
        skipDuplicates: true,
      });

      console.log('✅ System admin seeded successfully');
    });
  } catch (error) {
    console.error('❌ Error seeding system admin:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Add to package.json scripts:
// "seed": "node prisma/seed.js"
seedSystemAdmin();