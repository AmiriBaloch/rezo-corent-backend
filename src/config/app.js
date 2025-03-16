import express from "express";
import passport from "passport";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import authRoutes from "../modules/auth/routes.js";
import initializePassport from "./passport.js";

const app = express();

app.use(express.json());
app.use(cors());
app.use(helmet());
app.use(morgan("dev"));

initializePassport(passport);
app.use(passport.initialize());

app.use("/api/auth", authRoutes);

export default app;
