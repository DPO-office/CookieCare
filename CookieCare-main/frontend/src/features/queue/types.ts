export interface Job {
  id: string;
  userId: string;
  type: "file_processing" | "document_analysis" | "template_drafting" | "privacy_scanning" | "vulnerability_scanning";
  status: "queued" | "processing" | "completed" | "failed";
  progress: number;
  message: string;
  payload?: any;
  createdAt: string;
  completedAt?: string;
  result?: any;
  error?: string;
}
