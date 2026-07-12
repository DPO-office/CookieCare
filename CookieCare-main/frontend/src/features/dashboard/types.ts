import { LegalDocument } from "../../shared/types";

export interface DashboardStats {
  totalDocs: number;
  pendingSigs: number;
  redlinesPending: number;
}

export interface DashboardHomeProps {
  userName: string;
  setActiveTab: (tab: string) => void;
  documents: LegalDocument[];
  stats: DashboardStats;
}
