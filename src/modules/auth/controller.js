import { registerUser, loginUser } from "./service.js";

export const register = async (req, res) => {
  try {
    const token = await registerUser(req.body.email, req.body.password);
    res.json({ message: "User registered", token });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

export const login = async (req, res) => {
  try {
    const token = await loginUser(req.body.email, req.body.password);
    res.json({ message: "Login successful", token });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

export const protectedRoute = (req, res) => {
  res.json({ message: "Access granted", user: req.user });
};
