import express from "express";
import {
  register,
  verifyEmail,
  login,
  refreshAccessToken,
  logout,
  requestPasswordReset,
  resetPassword,
  googleAuthCallback,
  protectedRoute,
} from "./controller.js";
import passport from "passport";
import rateLimit from "express-rate-limit";
import requestContext from "../../middlewares/context.js";
import validate from "../../middlewares/validate.js";
import authSchemas from "./validation.schemas.js";
import authMiddleware from "../../middlewares/authentication.js";
// Rate limiting configuration
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Limit each IP to 20 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
});

const router = express.Router();

// Public routes with rate limiting and context
router.use(requestContext);

router.post(
  "/register",
  authLimiter,
  // validate(authSchemas.registerSchema),
  register
);

router.post("/login", authLimiter, 
  // (authSchemas.loginSchema), 
  login);

router.post(
  "/verify-email",
  authLimiter,
  // validate(authSchemas.verifyEmailSchema),
  verifyEmail
);

router.post(
  "/refresh-token",
  // validate(authSchemas.refreshTokenSchema),
  refreshAccessToken
);

// Password reset flow
router.post(
  "/password-reset",
  authLimiter,
  // validate(authSchemas.passwordResetRequestSchema),
  requestPasswordReset
);

router.post(
  "/password-reset/confirm",
  authLimiter,
  // validate(authSchemas.passwordResetConfirmSchema),
  resetPassword
);

// Google OAuth with state validation
router.get("/google", (req, res, next) => {
  req.session.state = crypto.randomBytes(16).toString("hex");
  passport.authenticate("google", {
    state: req.session.state,
    session: false,
    scope: ["profile", "email"],
  })(req, res, next);
});

router.get(
  "/google/callback",
  passport.authenticate("google", {
    failureRedirect: "/auth/error",
    session: false,
  }),
  googleAuthCallback
);

// Authenticated routes
router.use(authMiddleware());

router.post("/logout", logout);
router.get("/protected", protectedRoute);

export default router;
