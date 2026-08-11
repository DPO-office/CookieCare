import express from "express";
import { authenticateToken } from "../../../middleware/auth.js";
import {
  analyzePacController,
  resumeAskController,
  getSessionController,
} from "./controller.js";

const route = express.Router();

route.post("/run", authenticateToken, analyzePacController);
route.post("/resume-ask", authenticateToken, resumeAskController);
route.get("/session/:sessionId", authenticateToken, getSessionController);
route.get("/health", (_req, res) => {
  res.json({ message: "analysis PAC api ok" });
});

export default route;
