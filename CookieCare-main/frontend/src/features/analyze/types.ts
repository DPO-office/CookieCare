import { LegalDocument } from "../../shared/types";

export interface FolderFile {
  id: string;
  title: string;
  selected: boolean;
}

export interface CustomFolder {
  id: string;
  name: string;
  filesCount: number;
  selected: boolean;
  expanded: boolean;
  files: FolderFile[];
}

export interface SavedDraft {
  id: string;
  title: string;
  selected: boolean;
  /** Surfaced from the backend to guard against selecting in-progress drafts. */
  draft_status?: string;
}

export interface Message {
  sender: "user" | "gemini";
  text: string;
  sources?: Array<{ title: string; citation: string }>;
  loading?: boolean;
  streaming?: boolean;
}

export interface InteractAnalyzeProps {
  /** @deprecated Read from AppContext */
  documents?: LegalDocument[];
  /** @deprecated Read from AppContext */
  activeDocument?: LegalDocument | null;
  /** @deprecated Read from AppContext */
  authToken?: string;
  /** @deprecated Read from AppContext */
  onRefresh?: () => Promise<void>;
  /** @deprecated Read from AppContext */
  onSelectDocument?: (doc: LegalDocument | null) => void;
}

export type DocumentMode = "unified" | "individual";
export type AnswerStyle = "narrative" | "tabular";
export type AnalysisDepth = "deep" | "lite";

/** Wire name for the API — same values as AnalysisDepth. */
export type ThinkingMode = AnalysisDepth;
export type PromptTab = "write" | "library" | "questions";
export type SidePanelType = "folder" | "upload";

export interface PendingUpload {
  id: string;
  file: File;
  relativePath?: string;
  status: "pending" | "uploading" | "processing" | "done" | "error";
  error?: string;
  jobId?: string;
  fileId?: string;
}
