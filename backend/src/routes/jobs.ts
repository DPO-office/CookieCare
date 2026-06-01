import { Router } from "express";
import { authenticateToken } from "../middleware/auth.js";
import * as jobsController from "../controllers/jobs.js";

const router = Router();

router.get("/", authenticateToken, jobsController.getJobs);
router.get("/:id", authenticateToken, jobsController.getJobById);
router.get("/stream", jobsController.streamJobs);

export default router;
