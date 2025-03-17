import { Strategy as JwtStrategy, ExtractJwt } from "passport-jwt";
import { PrismaClient } from "@prisma/client";
import config from "./env.js";
import GoogleStrategy from "passport-google-oauth20";
import crypto from "crypto";
import logger from "../config/logger.js";

const prisma = new PrismaClient();

const jwtOptions = {
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: config.get("jwtSecret"),
  issuer: config.get("jwtIssuer"),
  audience: config.get("jwtAudience"),
  algorithms: ["HS256"],
};

export default (passport) => {
  // JWT Strategy with enhanced security
  passport.use(
    new JwtStrategy(jwtOptions, async (jwt_payload, done) => {
      try {
        // Validate token type
        if (jwt_payload.type !== "access") {
          return done(null, false, { message: "Invalid token type" });
        }

        const user = await prisma.user.findUnique({
          where: { id: jwt_payload.sub },
          include: {
            roles: {
              include: {
                role: {
                  include: { permissions: true },
                },
              },
            },
            sessions: {
              where: {
                expiresAt: { gt: new Date() },
              },
            },
          },
        });

        // Validate user status
        if (!user) {
          return done(null, false, { message: "User not found" });
        }
        if (!user.isActive) {
          return done(null, false, { message: "Account deactivated" });
        }
        if (!user.isVerified) {
          return done(null, false, { message: "Account unverified" });
        }

        // Validate active session
        if (user.sessions.length === 0) {
          return done(null, false, { message: "No active session" });
        }

        return done(null, user);
      } catch (error) {
        logger.error(`JWT Authentication Error: ${error.message}`);
        return done(error, false);
      }
    })
  );

  // Google OAuth Strategy with state validation
  passport.use(
    new GoogleStrategy(
      {
        clientID: config.get("googleClientId"),
        clientSecret: config.get("googleClientSecret"),
        callbackURL: config.get("googleCallbackURL"),
        passReqToCallback: true,
        state: true,
      },
      async (req, accessToken, refreshToken, profile, done) => {
        try {
          // Validate state parameter
          if (req.query.state !== req.session.state) {
            throw new Error("Invalid state parameter");
          }

          // Validate email presence
          if (!profile.emails?.length) {
            throw new Error("No email associated with Google account");
          }

          const email = profile.emails[0].value;
          const existingUser = await prisma.user.findUnique({
            where: { email },
            include: { roles: true },
          });

          // Handle existing user
          if (existingUser) {
            if (!existingUser.isActive) {
              throw new Error("Account deactivated");
            }

            await createAuditLog(
              existingUser.id,
              "LOGIN",
              req.ip,
              req.headers["user-agent"]
            );

            return done(null, existingUser);
          }

          // Generate unique username
          const baseUsername = email.split("@")[0];
          const uniqueUsername = await generateUniqueUsername(baseUsername);

          // Create new user
          const newUser = await prisma.user.create({
            data: {
              email,
              username: uniqueUsername,
              isVerified: true,
              isActive: true,
              passwordHash: null,
              profile: {
                create: {
                  firstName: profile.name?.givenName || "",
                  lastName: profile.name?.familyName || "",
                  avatarUrl: profile.photos?.[0]?.value || "",
                },
              },
              sessions: {
                create: {
                  sessionToken: crypto.randomBytes(32).toString("hex"),
                  refreshToken: crypto.randomBytes(32).toString("hex"),
                  deviceInfo: req.headers["user-agent"],
                  ipAddress: req.ip,
                  expiresAt: new Date(Date.now() + 3600 * 1000), // 1 hour
                },
              },
            },
            include: {
              roles: true,
              sessions: true,
            },
          });

          await createAuditLog(
            newUser.id,
            "REGISTER",
            req.ip,
            req.headers["user-agent"]
          );

          logger.info(`New user registered via Google: ${newUser.email}`);
          return done(null, newUser);
        } catch (error) {
          logger.error(`Google OAuth Error: ${error.message}`);
          return done(error, false);
        }
      }
    )
  );

  // Session serialization
  passport.serializeUser((user, done) => {
    done(null, {
      id: user.id,
      sessionId: user.sessions[0]?.id, // Track specific session
    });
  });

  passport.deserializeUser(async (serializedUser, done) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: serializedUser.id },
        include: {
          roles: {
            include: {
              role: {
                include: { permissions: true },
              },
            },
          },
          sessions: {
            where: { id: serializedUser.sessionId },
          },
        },
      });

      if (!user || user.sessions.length === 0) {
        return done(new Error("Session expired or invalid"));
      }

      done(null, user);
    } catch (error) {
      done(error);
    }
  });
};

// Helper functions
async function generateUniqueUsername(baseUsername) {
  let counter = 1;
  let candidate = baseUsername;

  while (true) {
    const existingUser = await prisma.user.findUnique({
      where: { username: candidate },
    });

    if (!existingUser) return candidate;

    candidate = `${baseUsername}${counter}`;
    counter++;

    if (counter > 100) {
      throw new Error("Username generation failed");
    }
  }
}

async function createAuditLog(userId, actionType, ipAddress, userAgent) {
  await prisma.auditLog.create({
    data: {
      actionType,
      entityType: "USER",
      entityId: userId,
      userId,
      ipAddress,
      userAgent,
    },
  });
}
