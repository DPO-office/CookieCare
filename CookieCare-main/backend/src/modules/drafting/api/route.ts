import express from "express";
import { authenticateToken } from "../../../middleware/auth.js";
import draftRouteController from "./controller.js";

const route = express.Router();

route.post("/generate-stream", authenticateToken, draftRouteController);
route.get("/health",(req,res)=>{
    res.json({message:"everything is working fine in draft template api"})
})

export default route;
