import React from "react";
import { FileText, Activity, FileEdit, Globe, ShieldAlert, Terminal } from "lucide-react";
import { Job } from "./types";
import { JOB_PROGRESS_BAR_COLOR } from "./constants";

export function getJobDetails(job: Job): { title: string; iconName: string } {
  switch (job.type) {
    case "file_processing":      return { title: "File ingestion & parse",           iconName: "FileText" };
    case "document_analysis":    return { title: "Compliance audit & risk scan",     iconName: "Activity" };
    case "template_drafting":    return { title: "Template-guided drafting",         iconName: "FileEdit" };
    case "privacy_scanning":     return { title: "Cookie consent crawler",           iconName: "Globe" };
    case "vulnerability_scanning": return { title: "SSL & header vulnerability probe", iconName: "ShieldAlert" };
    default:                     return { title: "Background system task",           iconName: "Terminal" };
  }
}

export function getProgressBarColor(status: Job["status"]): string {
  return JOB_PROGRESS_BAR_COLOR[status] ?? JOB_PROGRESS_BAR_COLOR.default;
}
