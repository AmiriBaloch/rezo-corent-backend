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
    const { email, password } = req.body;
    const { token, user } = await registerUser(email, password);
    res.json({
      message:
        "User registered. Please check your email to verify your account.",
      user,
      token,
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};
export const verifyEmail = async (req, res) => {
  try {
    const { token } = req.query; // Extract token from URL query params
    const response = await verifyEmailService(token);
    res.json(response);
  } catch (error) {
    res.status(400).json({ error: error.message });
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
    const { token, newPassword } = req.body;
    const response = await resetPasswordService(token, newPassword);
    res.json(response);
  } catch (error) {
    res.status(400).json({ error: error.message });
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
