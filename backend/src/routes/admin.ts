import { Router } from "express";
import { authenticateToken, isAdmin } from "../middleware/auth.js";
import * as adminController from "../controllers/admin.js";

const router = Router();

router.patch("/users/approve", authenticateToken, isAdmin, adminController.approveUser);
router.get("/pending-users", authenticateToken, isAdmin, adminController.getPendingUsers);

export default router;
