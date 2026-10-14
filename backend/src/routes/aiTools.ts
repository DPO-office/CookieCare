import { Router } from "express";
import { authenticateToken } from "../middleware/auth.js";
import {
  listAiTools,
  createAiTool,
  updateAiTool,
  deleteAiTool,
} from "../controllers/aiTools.js";

const router = Router();

router.get("/", authenticateToken, listAiTools);
router.post("/", authenticateToken, createAiTool);
router.put("/:id", authenticateToken, updateAiTool);
router.delete("/:id", authenticateToken, deleteAiTool);

export default router;
