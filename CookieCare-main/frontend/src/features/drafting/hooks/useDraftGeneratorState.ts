import { useState } from "react";
import { DraftMode, DraftDepth, AdvancedStep, ClauseTab, AdvancedField, TemplateFolder, ClauseCategory } from "../types";
import { DEFAULT_ADVANCED_FIELDS, DEFAULT_ADVANCED_FIELD_VALUES } from "../constants";

export function useDraftGeneratorState() {
  const [mode, setMode] = useState<DraftMode>("Basic");
  const [depth, setDepth] = useState<DraftDepth>("Standard");
  const [instructions, setInstructions] = useState("");
  const [playbookGuidelines, setPlaybookGuidelines] = useState("");
  const [customClauseText, setCustomClauseText] = useState("");

  // Basic Mode Form Inputs
  const [basicPartyA, setBasicPartyA] = useState("Lexify Corporate Client");
  const [basicPartyB, setBasicPartyB] = useState("Vendor Infrastructure Host");
  const [basicLaw, setBasicLaw] = useState("State of Delaware");
  const [basicLiability, setBasicLiability] = useState("USD $2,000,000 limit");

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
  const [advancedFields, setAdvancedFields] = useState<AdvancedField[]>(DEFAULT_ADVANCED_FIELDS);
  const [advancedFieldValues, setAdvancedFieldValues] = useState<Record<string, string>>(DEFAULT_ADVANCED_FIELD_VALUES);

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
    basicPartyA,
    setBasicPartyA,
    basicPartyB,
    setBasicPartyB,
    basicLaw,
    setBasicLaw,
    basicLiability,
    setBasicLiability,
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
    advancedFields,
    setAdvancedFields,
    advancedFieldValues,
    setAdvancedFieldValues,
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
