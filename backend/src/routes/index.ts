import { Router } from "express";
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

const router = Router();

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