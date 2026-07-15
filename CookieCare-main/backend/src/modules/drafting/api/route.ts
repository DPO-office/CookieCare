import express from "express";
import multer from "multer";
import { authenticateToken } from "../../../middleware/auth.js";
import {
    draftRouteController,
    refineRouteController,
    processUploadedTemplateController
} from "./controller.js";

const route = express.Router();
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 75 * 1024 * 1024 }
});

route.post("/generate-stream", authenticateToken, draftRouteController);
route.post("/refine", authenticateToken, refineRouteController);
route.post(
    "/process-uploaded-template",
    authenticateToken,
    upload.single("file"),
    processUploadedTemplateController
);
route.get("/health", (req, res) => {
    res.json({ message: "everything is working fine in draft template api" });
});

export default route;
