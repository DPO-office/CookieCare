import { LegalDocument } from "../../shared/types";

export type DashboardJobStatus = "queued" | "processing" | "completed" | "failed";

export interface DashboardJob {
  id: string;
  type: string;
  status: DashboardJobStatus;
  progress: number;
  message: string;
  payload: Record<string, unknown>;
  result: unknown;
  error: string;
  createdAt: string;
  completedAt?: string;
  updatedAt?: string;
}

export interface DashboardHomeProps {
  userName: string;
  setActiveTab: (tab: string) => void;
  documents: LegalDocument[];
  authToken: string;
}

export interface DocumentRow {
  id: string;
  title: string;
  type: string;
  updatedAt: string;
  updatedLabel: string;
  analyzed: boolean;
  findingCount: number | null;
}
