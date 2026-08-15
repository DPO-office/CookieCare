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
}

export interface Message {
  sender: "user" | "gemini";
  text: string;
  sources?: Array<{ title: string; citation: string }>;
  loading?: boolean;
  streaming?: boolean;
}

export interface InteractAnalyzeProps {
  documents: LegalDocument[];
  activeDocument: LegalDocument | null;
  authToken: string;
  onRefresh: () => Promise<void>;
  onSelectDocument: (doc: LegalDocument | null) => void;
}

export type DocumentMode = "unified" | "individual";
export type AnswerStyle = "narrative" | "tabular";
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
