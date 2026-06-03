import { Router } from "express";
import { authenticateToken } from "../middleware/auth.js";
import * as docController from "../controllers/documents.js";
import multer from "multer";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 75 * 1024 * 1024 } });

router.get("/", authenticateToken, docController.getDocuments);
router.get("/:id", authenticateToken, docController.getDocumentById);
router.post("/", authenticateToken, docController.createDocument);
router.post("/upload", authenticateToken, upload.single("file"), docController.uploadDocument);
router.post("/export", authenticateToken, docController.exportDocument);

export default router;