import express from "express";
import { authenticateToken } from "../../../middleware/auth.js";
import draftRouteController from "./controller.js";

const route = express.Router();

route.post("/generate-stream", authenticateToken, draftRouteController);


export default route;
