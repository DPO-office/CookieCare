import { Router } from "express";
import { authenticateToken } from "../middleware/auth.js";
import * as folderController from "../controllers/folders.js";

const router = Router();

router.get("/", authenticateToken, folderController.getFolders);
router.post("/", authenticateToken, folderController.createFolder);
router.delete("/:id", authenticateToken, folderController.deleteFolder);

export default router;
