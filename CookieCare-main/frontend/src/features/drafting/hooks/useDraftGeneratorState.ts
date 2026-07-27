import { useState } from "react";
import { DraftMode, DraftDepth, AdvancedStep, ClauseTab, TemplateFolder, ClauseCategory } from "../types";

export function useDraftGeneratorState() {
  const [mode, setMode] = useState<DraftMode>("Basic");
  const [depth, setDepth] = useState<DraftDepth>("Standard");
  const [instructions, setInstructions] = useState("");
  const [playbookGuidelines, setPlaybookGuidelines] = useState("");
  const [customClauseText, setCustomClauseText] = useState("");

  // Basic/structured party, law and liability inputs were removed: the backend now
  // derives all such details from the raw instructions in step 1 (requirement
  // extraction), so the UI only collects free-text intent.

  // Advanced Mode step hierarchy
  const [advancedStep, setAdvancedStep] = useState<AdvancedStep>("selector");
  const [clauseTab, setClauseTab] = useState<ClauseTab>("clauses");

  // Expanded Accordion Sections
  const [s1Open, setS1Open] = useState(true);
  const [s2Open, setS2Open] = useState(false);
  const [s3Open, setS3Open] = useState(false);
  const [s4Open, setS4Open] = useState(false);

  // Folder expansion states
  const [expandedFolder, setExpandedFolder] = useState<string | null>("Lexify Templates");
  const [expandedClauseCat, setExpandedClauseCat] = useState<string | null>("Lexify Clause Library");

  // Search filters
  const [searchTemplateQuery, setSearchTemplateQuery] = useState("");
  const [searchClauseQuery, setSearchClauseQuery] = useState("");

  // Selections
  const [selectedTemplateName, setSelectedTemplateName] = useState<string | null>("Mutual Non-Disclosure Agreement");
  const [selectedClauses, setSelectedClauses] = useState<string[]>([]);
  const [referenceInstructions, setReferenceInstructions] = useState("");
  const [aiRulebookPrompt, setAiRulebookPrompt] = useState("");

  // Template folders and clause categories
  const [templateFolders, setTemplateFolders] = useState<TemplateFolder[]>([]);
  const [clauseCategories, setClauseCategories] = useState<ClauseCategory[]>([]);

  // Reactive (upload) state
  const [isDragging, setIsDragging] = useState(false);
  const [uploadText, setUploadText] = useState("");
  const [uploadFileName, setUploadFileName] = useState("");
  const [sourceDocumentId, setSourceDocumentId] = useState("");
  const [isParsingTemplate, setIsParsingTemplate] = useState(false);

  // Streaming & Loading states
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingProgress, setStreamingProgress] = useState("");
  const [draftError, setDraftError] = useState("");
  const [refinementProgress, setRefinementProgress] = useState("");
  const [refinementError, setRefinementError] = useState("");

  return {
    mode,
    setMode,
    depth,
    setDepth,
    instructions,
    setInstructions,
    playbookGuidelines,
    setPlaybookGuidelines,
    customClauseText,
    setCustomClauseText,
    advancedStep,
    setAdvancedStep,
    clauseTab,
    setClauseTab,
    s1Open,
    setS1Open,
    s2Open,
    setS2Open,
    s3Open,
    setS3Open,
    s4Open,
    setS4Open,
    expandedFolder,
    setExpandedFolder,
    expandedClauseCat,
    setExpandedClauseCat,
    searchTemplateQuery,
    setSearchTemplateQuery,
    searchClauseQuery,
    setSearchClauseQuery,
    selectedTemplateName,
    setSelectedTemplateName,
    selectedClauses,
    setSelectedClauses,
    referenceInstructions,
    setReferenceInstructions,
    aiRulebookPrompt,
    setAiRulebookPrompt,
    templateFolders,
    setTemplateFolders,
    clauseCategories,
    setClauseCategories,
    isDragging,
    setIsDragging,
    uploadText,
    setUploadText,
    uploadFileName,
    setUploadFileName,
    sourceDocumentId,
    setSourceDocumentId,
    isParsingTemplate,
    setIsParsingTemplate,
    isStreaming,
    setIsStreaming,
    streamingProgress,
    setStreamingProgress,
    draftError,
    setDraftError,
    refinementProgress,
    setRefinementProgress,
    refinementError,
    setRefinementError,
  };
}
