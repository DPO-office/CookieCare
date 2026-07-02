import { en } from "zod/v4/locales";





// Pipeline Step 1: Stuctured Requirements
export interface RequirementContext {
    contractType: string;
    industry?: string;
    jurisdiction?: string;
    language: string;
    parties: {
        name:string,
        role:string
    }[];
    requiredClauses: string[];
    optionalClauses: string[];
    instructions: string;

}


export interface RetrievalContext {
    template?: Template;
    clauses: Clause[];
    playbook?: Playbook;
    similarContracts: PreviousContract[];

}

export interface DraftContext {
    systemPrompt: string;
    assembledPrompt: string;
    skeleton: ContractSkeleton;
    
}


export interface DraftResult {

    content: string;

    model: string;

    tokensUsed: number;

}

enum severity {
    HIGH = "HIGH",
    INTERMIDATE="INTERMIDATE",
    LOW = "LOW"
}



interface ValidationIssue {
    severity: severity,
    message:string
}

export interface ValidationResult {
    passed: boolean;
    issues: ValidationIssue[];
    score: number;
}

export interface Metadata {
    jobId: string;
    userId: string;
    organizationId: string;
    startedAt: Date;    
}




export interface DraftState {

    request: DraftRequest;

    requirements?: RequirementContext;

    retrieval?: RetrievalContext;

    context?: DraftContext;

    draft?: DraftResult;

    validation?: ValidationResult;

    metadata: Metadata;
}




