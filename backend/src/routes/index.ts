import { Router } from "express";
import authRoutes from "./auth.js";
import adminRoutes from "./admin.js";
import documentRoutes from "./documents.js";
import folderRoutes from "./folders.js";
import libraryItemRoutes from "./libraryItems.js";
import jobRoutes from "./jobs.js";
import analyzeRoutes from "./analyze.js";
import vulnerabilitiesRoutes from "./vulnerabilities.js";

const router = Router();

router.use("/analyze", analyzeRoutes);
router.use("/", vulnerabilitiesRoutes);
router.use("/auth", authRoutes);
router.use("/admin", adminRoutes);
router.use("/documents", documentRoutes);
router.use("/folders", folderRoutes);
router.use("/library-items", libraryItemRoutes);
router.use("/jobs", jobRoutes);

export default router;
