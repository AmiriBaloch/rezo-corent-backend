import {
  registerUser,
  loginUser,
  refreshToken,
  logoutUser,
  verifyEmailService,
  requestPasswordResetService,
  resetPasswordService,
} from "./service.js";

export const register = async (req, res) => {
  try {
    // Validate input
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: "Email and password are required",
      });
    }

    // Register user
    const result = await registerUser({ email, password });

    // Set secure HTTP-only cookie for refresh token
    res.cookie("refreshToken", result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    // Successful response
    res.status(201).json({
      success: true,
      message:
        "User registered successfully. Please check your email to verify your account.",
      data: {
        user: {
          id: result.user.id,
          email: result.user.email,
          createdAt: result.user.createdAt,
        },
        accessToken: result.accessToken,
      },
    });
  } catch (error) {
    // Log the error for debugging
    console.error("Registration error:", error);

    // Handle specific error types
    let statusCode = 400;
    let errorMessage = error.message;

    if (error.message.includes("already in use")) {
      statusCode = 409; // Conflict
    }

    res.status(statusCode).json({
      success: false,
      error: errorMessage,
      details: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
};

export const verifyEmail = async (req, res) => {
  try {
    // Validate input
    const { otp } = req.query;
    if (!otp || otp.length !== 6) {
      return res.status(400).json({
        success: false,
        error: "Invalid OTP format. OTP must be 6 digits.",
      });
    }

    // Verify email using service
    const { user, refreshToken, accessToken } = await verifyEmailService(otp);
  
    // Successful response
    res.status(200).json({
      success: true,
      message: "Email verified successfully",
      data: {
        user: {
          id: user.id,
          email: user.email,
          emailVerified: user.emailVerified,
        },
        accessToken,
        refreshToken,
      },
    });
  } catch (error) {
    // Log the error for debugging
    console.error("Email verification error:", error);

    // Handle specific error types
    let statusCode = 400;
    let errorMessage = error.message;

    if (error.message.includes("expired")) {
      statusCode = 410; // Gone
      errorMessage = "OTP has expired. Please request a new one.";
    } else if (error.message.includes("invalid")) {
      statusCode = 401; // Unauthorized
      errorMessage = "Invalid OTP. Please check your code and try again.";
    }

    res.status(statusCode).json({
      success: false,
      error: errorMessage,
      details: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const { user, accessToken, refreshToken } = await loginUser(
      email,
      password
    );
    res.json({ message: "Login successful", accessToken, refreshToken, user });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};
export const refreshAccessToken = async (req, res) => {
  try {
    const token = req.cookies?.refreshToken;
    if (!token)
      return res.status(400).json({ error: "Refresh token is required" });

    const { accessToken } = await refreshToken(token);
    res.json({ accessToken });
  } catch (error) {
    res.status(401).json({ error: error.message });
  }
};

export const logout = async (req, res) => {
  try {
    const userId = req.user.id;
    await logoutUser(userId);
    res.json({ message: "Logout successful" });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

export const requestPasswordReset = async (req, res) => {
  try {
    const { email } = req.body;
    const response = await requestPasswordResetService(email);
    res.json(response);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

export const resetPassword = async (req, res) => {
  try {
    // Validate input
    const { otp, newPassword } = req.body;

    if (!otp || otp.length !== 6) {
      return res.status(400).json({
        success: false,
        error: "Invalid OTP format. OTP must be 6 digits.",
      });
    }

    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        error: "Password must be at least 8 characters long.",
      });
    }

    // Reset password using service
    const result = await resetPasswordService(otp, newPassword);

    // Clear refresh token cookie if exists
    res.clearCookie("refreshToken", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
    });

    // Successful response
    res.status(200).json({
      success: true,
      message:
        "Password reset successfully. Please login with your new password.",
      data: {
        email: result.email,
        passwordChangedAt: result.passwordChangedAt,
      },
    });
  } catch (error) {
    // Log the error for debugging
    console.error("Password reset error:", error);

    // Handle specific error types
    let statusCode = 400;
    let errorMessage = error.message;

    if (error.message.includes("expired")) {
      statusCode = 410; // Gone
      errorMessage = "OTP has expired. Please request a new one.";
    } else if (error.message.includes("invalid")) {
      statusCode = 401; // Unauthorized
      errorMessage = "Invalid OTP. Please check your code and try again.";
    }

    res.status(statusCode).json({
      success: false,
      error: errorMessage,
      details: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
};

export const googleAuthCallback = (req, res) => {
  try {
    res.json({ message: "Google login successful", user: req.user });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};
export const protectedRoute = (req, res) => {
  res.json({ message: "Access granted", user: req.user });
};
