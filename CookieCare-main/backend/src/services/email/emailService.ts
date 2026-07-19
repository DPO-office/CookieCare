/**
 * Email Service
 *
 * Reusable Nodemailer-based email service for all CookieCare features.
 * Supports: Cookie Scanner, Vulnerability Scanner, Vendor Review, DPA Review, AI Ethics Review.
 *
 * Configuration is read exclusively from environment variables — no credentials are hardcoded.
 */
import nodemailer from "nodemailer";
import { logger } from "../../utils/logger.js";

export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: EmailAttachment[];
}

/**
 * Returns true when all required SMTP env vars are present.
 */
function isSmtpConfigured(): boolean {
  return !!(
    process.env.SMTP_HOST &&
    process.env.SMTP_PORT &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS
  );
}

/**
 * Creates and returns a configured Nodemailer transporter.
 * Throws if SMTP credentials are not set.
 */
function createTransporter(): nodemailer.Transporter {
  if (!isSmtpConfigured()) {
    throw new Error("SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASS.");
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    // Port 465 uses implicit TLS; all others use STARTTLS
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

/**
 * Sends a single email.
 *
 * In development/demo mode (no SMTP env vars), the send is skipped and a
 * success response is returned so the rest of the application can be tested
 * without a live mail server.
 */
export async function sendEmail(options: SendEmailOptions): Promise<void> {
  const fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER || "noreply@cookiecare.ai";

  if (!isSmtpConfigured()) {
    logger.info(
      { to: options.to, subject: options.subject },
      "[EmailService] SMTP not configured — running in demo mode, email not sent."
    );
    return;
  }

  const transporter = createTransporter();

  await transporter.sendMail({
    from: `"Lexify AI" <${fromAddress}>`,
    to: options.to,
    subject: options.subject,
    html: options.html,
    text: options.text,
    attachments: options.attachments?.map((a) => ({
      filename: a.filename,
      content: a.content,
      contentType: a.contentType,
    })),
  });

  logger.info({ to: options.to, subject: options.subject }, "[EmailService] Email sent successfully.");
}
