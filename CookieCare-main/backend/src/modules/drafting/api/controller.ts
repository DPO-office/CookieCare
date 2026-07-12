import { addJobToQueue } from "@/backend/src/services/jobQueue";
import { Request, Response } from "express";
import { DraftRequestSchema } from "./schema";




const draftRouteController = async (req: Request, res: Response): Promise<void> => {
    try {
        const request = DraftRequestSchema.safeParse(req.body)

        if(!request.success) {
            throw new Error("Zod validation error")
        }

        const job = await addJobToQueue(req.user?.id, "template_drafting", req.body);
        res.status(202).json({ success: true, job_id: job.id });
    } 
    
    catch (err: any) {
        res.status(500).json({ error: err.message });
      }


};

export default draftRouteController;
