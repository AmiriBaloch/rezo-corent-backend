import { registerUser, loginUser, refreshToken, logoutUser } from "./service.js";

export const register = async (req, res) => {
  try {
    const { email, password } = req.body;
    const { token, user } = await registerUser(email, password);
    res.json({ message: "User registered", user, token });
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

export const protectedRoute = (req, res) => {
  res.json({ message: "Access granted", user: req.user });
};
