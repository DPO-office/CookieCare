import { Router } from "express";
import { authenticateToken } from "../middleware/auth.js";
import { getJobs, getJobById, streamJobs } from "../controllers/jobs.js";

const router = Router();

// Re-enforcing authentication.
// The issue was likely not 'redundancy' but how it was applied or handled.
// authenticateToken correctly handles query.token for SSE.
router.get("/", authenticateToken, getJobs);
router.get("/stream", authenticateToken, streamJobs);
router.get("/sse", authenticateToken, streamJobs); // Alias for frontend compatibility
router.get("/:id", authenticateToken, getJobById);

export default router;
