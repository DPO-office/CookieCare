import { Router, Request, Response } from "express";
import { pool } from "../config/database.js";
import authRoutes from "./auth.js";
import adminRoutes from "./admin.js";
import documentRoutes from "./documents.js";
import folderRoutes from "./folders.js";
import libraryItemRoutes from "./libraryItems.js";
import jobRoutes from "./jobs.js"; 
import analyzeRoutes from "./analyze.js";
import draftingRoutes from "./drafting.js";
import lawyerRoutes from "./lawyer.js";
import negotiateRoutes from "./negotiate.js";
import vulnerabilitiesRoutes from "./vulnerabilities.js";
import reportRoutes from "./reports.js";
import settingsRoutes from "./settings.js";
import { authenticateToken } from "../middleware/auth.js";

const router = Router();

router.get("/health", async (req: Request, res: Response) => {
  try {
    const start = Date.now();
    await pool.query("SELECT 1");
    const latency = Date.now() - start;
    res.json({
      status: "UP",
      database: "CONNECTED",
      latency: `${latency}ms`,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(503).json({
      status: "DOWN",
      database: "DISCONNECTED",
      timestamp: new Date().toISOString()
    });
  }
});

router.use("/auth", authRoutes);
router.use("/admin", adminRoutes);
router.use("/documents", documentRoutes);
router.use("/folders", folderRoutes);
router.use("/library-items", libraryItemRoutes);
router.use("/jobs", jobRoutes);
router.use("/analyze", analyzeRoutes);
router.use("/drafting", draftingRoutes);
router.use("/lawyer", lawyerRoutes);
router.use("/negotiate", negotiateRoutes);
router.use("/vulnerabilities", vulnerabilitiesRoutes);
router.use("/reports", reportRoutes);
router.use("/settings", settingsRoutes);

export default router;