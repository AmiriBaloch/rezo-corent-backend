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
} from "./controller.js";
import passport from "passport";
import rateLimit from "express-rate-limit";
import requestContext from "../../middlewares/context.js";
import validate from "../../middlewares/validate.js";
import authSchemas from "./schemas.js";
import { authenticateUser as authMiddleware } from "../../middlewares/authentication.js";
import { guestMiddleware } from "../../middlewares/guestMiddleware.js";
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
/**
 * @openapi
 * /auth/register:
 *   post:
 *     tags: [Authentication]
 *     summary: Register a new user
 *     description: Create a new user account
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegisterRequest'
 *     responses:
 *       201:
 *         description: User registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       400:
 *         description: Validation error
 *       429:
 *         description: Too many requests
 */
router.post(
  "/register",
  authLimiter,
  validate(authSchemas.registerSchema),
  register
);
/**
 * @openapi
 * /auth/login:
 *   post:
 *     tags: [Authentication]
 *     summary: Authenticate user
 *     description: Log in with email and password
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *     responses:
 *       200:
 *         description: Authentication successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       400:
 *         description: Invalid credentials
 *       401:
 *         description: Unauthorized
 *       429:
 *         description: Too many requests
 */

router.post(
  "/login",
  authLimiter,
  guestMiddleware(),
  validate(authSchemas.loginSchema),
  login
);
/**
 * @openapi
 * /auth/verify-email:
 *   post:
 *     tags: [Authentication]
 *     summary: Verify email address
 *     description: Verify user's email address with verification token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/VerifyEmailRequest'
 *     responses:
 *       200:
 *         description: Email verified successfully
 *       400:
 *         description: Invalid token
 *       429:
 *         description: Too many requests
 */
router.post(
  "/verify-email",
  guestMiddleware(),
  authLimiter,
  validate(authSchemas.verifyEmailSchema),
  verifyEmail
);
/**
 * @openapi
 * /auth/refresh-token:
 *   post:
 *     tags: [Authentication]
 *     summary: Refresh access token
 *     description: Generate new access token using refresh token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RefreshTokenRequest'
 *     responses:
 *       200:
 *         description: New tokens generated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       400:
 *         description: Invalid refresh token
 *       401:
 *         description: Unauthorized
 */
router.post(
  "/refresh-token",
  validate(authSchemas.refreshTokenSchema),
  refreshAccessToken
);
/**
 * @openapi
 * /auth/password-reset:
 *   post:
 *     tags: [Authentication]
 *     summary: Request password reset
 *     description: Initiate password reset flow
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PasswordResetRequest'
 *     responses:
 *       200:
 *         description: Password reset email sent
 *       400:
 *         description: Invalid email
 *       429:
 *         description: Too many requests
 */

// Password reset flow
router.post(
  "/password-reset",
  authLimiter,
  validate(authSchemas.passwordResetRequestSchema),
  requestPasswordReset
);
/**
 * @openapi
 * /auth/password-reset/confirm:
 *   post:
 *     tags: [Authentication]
 *     summary: Confirm password reset
 *     description: Complete password reset with token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PasswordResetConfirm'
 *     responses:
 *       200:
 *         description: Password reset successful
 *       400:
 *         description: Invalid token
 *       429:
 *         description: Too many requests
 */
router.post(
  "/password-reset/confirm",
  authLimiter,
  validate(authSchemas.passwordResetConfirmSchema),
  resetPassword
);
/**
 * @openapi
 * /auth/google:
 *   get:
 *     tags: [Authentication]
 *     summary: Initiate Google OAuth
 *     description: Redirect to Google for authentication
 *     responses:
 *       302:
 *         description: Redirect to Google
 */

// Google OAuth with state validation
router.get("/google", (req, res, next) => {
  req.session.state = crypto.randomBytes(16).toString("hex");
  passport.authenticate("google", {
    state: req.session.state,
    session: false,
    scope: ["profile", "email"],
  })(req, res, next);
});
/**
 * @openapi
 * /auth/google/callback:
 *   get:
 *     tags: [Authentication]
 *     summary: Google OAuth callback
 *     description: Handle Google OAuth callback
 *     responses:
 *       200:
 *         description: Authentication successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       400:
 *         description: Authentication failed
 */

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
/**
 * @openapi
 * /auth/logout:
 *   post:
 *     tags: [Authentication]
 *     summary: Log out user
 *     description: Invalidate user session and tokens
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Logout successful
 *       401:
 *         description: Unauthorized
 */
router.post("/logout", logout);

export default router;
