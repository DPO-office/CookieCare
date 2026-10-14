export interface User {
  id: string;
  email: string;
  name: string;
  status: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';
  role: 'USER' | 'ADMIN';
  password_hash?: string;
  approved_at?: string;
  created_at?: string;
}

export interface Version {
  version: number;
  content: string;
  createdAt: string;
  author: string;
  comment: string;
}

export interface Signature {
  signerEmail: string;
  signedAt: string | null;
  signatureHash: string | null;
  status: "pending" | "signed";
}

export interface RedlineProposal {
  id: string;
  proposedByEmail: string;
  proposedAt: string;
  originalText: string;
  proposedText: string;
  comment: string;
  status: "pending" | "accepted" | "rejected";
}

export interface AuditLog {
  timestamp: string;
  action: string;
  user: string;
  details: string;
}

export interface DocumentAnalysis {
  summary: string;
  risks: Array<{
    id: string;
    clause: string;
    severity: "low" | "medium" | "high";
    description: string;
    actionableInsight: string;
  }>;
  complianceGaps: Array<{
    regulation: string;
    complianceState: "compliant" | "gap";
    notes: string;
  }>;
}

export interface LegalDocument {
  id: string;
  title: string;
  type: string;
  creatorId: string;
  creatorEmail: string;
  content: string;
  isEncrypted: boolean;
  createdAt: string;
  updatedAt: string;
  versions: Version[];
  signatures: Signature[];
  redlines: RedlineProposal[];
  sharedWith: string[];
  auditLogs: AuditLog[];
  analysis?: DocumentAnalysis | null;
  folder_id?: string | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        name: string;
        status: string;
        role: string;
      };
    }
  }
}
