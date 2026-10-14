import { Router } from "express";
import { authenticateToken, isAdmin } from "../middleware/auth.js";
import * as adminController from "../controllers/admin.js";

const router = Router();

router.patch("/users/update", authenticateToken, isAdmin, adminController.approveUser);
router.get("/users", authenticateToken, isAdmin, adminController.getAllUsers);
router.get("/pending-users", authenticateToken, isAdmin, adminController.getPendingUsers);
router.post("/reindex-chunks", authenticateToken, isAdmin, adminController.reindexChunks);
router.post("/backfill-document-graphs", authenticateToken, isAdmin, adminController.backfillDocumentGraphs);

export default router;
