import { Strategy as JwtStrategy, ExtractJwt } from "passport-jwt";
import { PrismaClient } from "@prisma/client";
import config from "./env.js";
import GoogleStrategy from "passport-google-oauth20";
// dotenv.config();
const prisma = new PrismaClient();

const options = {
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: config.get("jwtSecret"),
};

export default (passport) => {
  passport.use(
    new JwtStrategy(options, async (jwt_payload, done) => {
      try {
        const user = await prisma.user.findUnique({
          where: { id: jwt_payload.id },
        });
        return user ? done(null, user) : done(null, false);
      } catch (err) {
        return done(err, false);
      }
    })
  );
  passport.use(
    new GoogleStrategy(
      {
        clientID: config.get("googleClientId"),
        clientSecret: config.get("googleClientSecret"),
        callbackURL: "/api/auth/google/callback",
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          let user = await prisma.user.findUnique({
            where: { email: profile.emails[0].value },
          });

          if (!user) {
            user = await prisma.user.create({
              data: { email: profile.emails[0].value, emailVerified: true },
            });
          }

          return done(null, user);
        } catch (err) {
          return done(err, false);
        }
      }
    )
  );
};
