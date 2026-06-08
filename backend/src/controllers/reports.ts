import { Request, Response } from "express";
import nodemailer from "nodemailer";

export const shareReportEmail = async (req: Request, res: Response) => {
  const { recipientEmail, subject, reportTitle, contentType, content, format } = req.body;

  if (!recipientEmail || !content) {
    return res.status(400).json({ error: "Recipient email and report content are required." });
  }

  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.example.com",
      port: Number(process.env.SMTP_PORT) || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    if (!process.env.SMTP_USER) {
      console.log(`[STUB]: Sending report "${reportTitle}" to ${recipientEmail} in ${format} format.`);
      return res.json({ success: true, message: `[DEMO MODE] Report successfully dispatched to ${recipientEmail}.` });
    }

    await transporter.sendMail({
      from: '"PrivSecAI Audits" <noreply@privsecai.cloud>',
      to: recipientEmail,
      subject: subject || `PrivSecAI Report: ${reportTitle}`,
      text: content,
    });

    res.json({ success: true, message: `Report successfully dispatched to ${recipientEmail}.` });
  } catch (err: any) {
    console.error("Failed to share report via email:", err);
    res.status(500).json({ error: "Internal server error during report dispatch." });
  }
};
