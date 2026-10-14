import { Router } from "express";
import { authenticateToken } from "../middleware/auth.js";
import { shareReportEmail } from "../controllers/reports.js";

const router = Router();

router.post("/share-email", authenticateToken, shareReportEmail);

export default router;
