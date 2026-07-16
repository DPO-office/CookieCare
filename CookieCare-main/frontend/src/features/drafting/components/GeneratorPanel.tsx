import React, { useEffect } from "react";
import {
  FileText,
  HelpCircle,
  ChevronDown,
  ArrowRight,
  Upload,
  Play,
  Clock,
} from "lucide-react";
import { apiUrl } from "../../../config";
import { LegalDocument } from "../../../shared/types";
import { DraftMode, DraftDepth, AdvancedStep, ClauseTab, TemplateFolder, ClauseCategory } from "../types";
import GeneratorBasicMode from "./GeneratorBasicMode";
import GeneratorAdvancedSelector from "./GeneratorAdvancedSelector";
import GeneratorAdvancedReactive from "./GeneratorAdvancedReactive";
import GeneratorAdvancedProactive from "./GeneratorAdvancedProactive";

interface GeneratorPanelProps {
  documents: LegalDocument[];
  selectedDoc: LegalDocument | null;
  authToken: string;
  mode: DraftMode;
  depth: DraftDepth;
  instructions: string;
  playbookGuidelines: string;
  customClauseText: string;
  basicPartyA: string;
  basicPartyB: string;
  basicLaw: string;
  basicLiability: string;
  advancedStep: AdvancedStep;
  clauseTab: ClauseTab;
  s1Open: boolean;
  s2Open: boolean;
  s3Open: boolean;
  s4Open: boolean;
  expandedFolder: string | null;
  expandedClauseCat: string | null;
  searchTemplateQuery: string;
  searchClauseQuery: string;
  selectedTemplateName: string | null;
  selectedClauses: string[];
  referenceInstructions: string;
  aiRulebookPrompt: string;
  templateFolders: TemplateFolder[];
  clauseCategories: ClauseCategory[];
  isDragging: boolean;
  uploadText: string;
  uploadFileName: string;
  isParsingTemplate: boolean;
  advancedFields: any[];
  advancedFieldValues: Record<string, string>;
  isStreaming: boolean;
  streamingProgress: string;
  draftError: string;
  onSetMode: (mode: DraftMode) => void;
  onSetDepth: (depth: DraftDepth) => void;
  onSetInstructions: (inst: string) => void;
  onSetPlaybookGuidelines: (guide: string) => void;
  onSetCustomClauseText: (text: string) => void;
  onSetBasicPartyA: (val: string) => void;
  onSetBasicPartyB: (val: string) => void;
  onSetBasicLaw: (val: string) => void;
  onSetBasicLiability: (val: string) => void;
  onSetAdvancedStep: (step: AdvancedStep) => void;
  onSetClauseTab: (tab: ClauseTab) => void;
  onSetS1Open: (open: boolean) => void;
  onSetS2Open: (open: boolean) => void;
  onSetS3Open: (open: boolean) => void;
  onSetS4Open: (open: boolean) => void;
  onSetExpandedFolder: (folder: string | null) => void;
  onSetExpandedClauseCat: (cat: string | null) => void;
  onSetSearchTemplateQuery: (q: string) => void;
  onSetSearchClauseQuery: (q: string) => void;
  onSetSelectedTemplateName: (name: string | null) => void;
  onSetSelectedClauses: (clauses: string[]) => void;
  onSetReferenceInstructions: (inst: string) => void;
  onSetAiRulebookPrompt: (prompt: string) => void;
  onSetTemplateFolders: (folders: TemplateFolder[]) => void;
  onSetClauseCategories: (cats: ClauseCategory[]) => void;
  onSetIsDragging: (drag: boolean) => void;
  onSetUploadText: (text: string) => void;
  onSetUploadFileName: (name: string) => void;
  onSetIsParsingTemplate: (parsing: boolean) => void;
  onSetAdvancedFields: (fields: any[]) => void;
  onSetAdvancedFieldValues: (vals: Record<string, string>) => void;
  onHandleDragOver: (e: React.DragEvent) => void;
  onHandleDragLeave: () => void;
  onHandleDrop: (e: React.DragEvent) => void;
  onHandleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onExecuteDraftStream: () => void;
  onSelectDoc: (doc: LegalDocument) => void;
}

export default function GeneratorPanel(props: GeneratorPanelProps) {
  const fetchLibrary = async () => {
    try {
      const res = await fetch(apiUrl("/api/library-items"), {
        headers: { "Authorization": `Bearer ${props.authToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        const templates = data.filter((i: any) => i.type === "templates");
        const clauses = data.filter((i: any) => i.type === "clauses");

        props.onSetTemplateFolders([{
          name: "Lexify Templates",
          count: templates.length,
          items: templates.map((t: any) => t.name)
        }]);

        props.onSetClauseCategories([{
          name: "Lexify Clause Library",
          count: clauses.length,
          items: clauses.map((c: any) => c.name)
        }]);
      }
    } catch (err) {
      console.error("Library fetch failed", err);
    }
  };

  useEffect(() => {
    fetchLibrary();
  }, [props.authToken]);

  return (
    <div className="flex-1 flex flex-col overflow-y-auto px-10 py-8 bg-[#FAFAFB] relative scrollbar-hidden select-none">
      {/* Header */}
      <div className="w-full flex justify-between items-start mb-9 z-10">
        <div>
          <h1 className="text-[26px] font-bold text-gray-900 tracking-tight">Draft Agreements</h1>
          <p className="text-[13px] text-gray-500 mt-1">Create AI-powered first drafts in seconds.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {props.documents.length > 0 && (
            <div className="flex items-center space-x-2 bg-white border border-gray-200 h-9 px-3 rounded-xl shadow-xs select-none">
              <FileText className="w-4 h-4 text-gray-400" />
              <span className="text-[10px] font-mono font-bold uppercase text-gray-400">Target:</span>
              <select
                value={props.selectedDoc?.id || ""}
                onChange={(e) => {
                  const found = props.documents.find(d => d.id === e.target.value);
                  if (found) {
                    props.onSelectDoc(found);
                  }
                }}
                className="bg-transparent border-none text-[12px] font-semibold text-gray-800 focus:outline-none cursor-pointer p-0 pr-1"
              >
                <option value="" disabled>-- Select draft --</option>
                {props.documents.map((doc) => (
                  <option key={doc.id} value={doc.id}>
                    {doc.title.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>
          )}

          <button className="flex items-center justify-center w-9 h-9 bg-white border border-gray-200 rounded-xl text-gray-400 hover:bg-gray-50 shadow-xs transition">
            <HelpCircle className="w-4.5 h-4.5" />
          </button>
        </div>
      </div>

      {/* Mode Toggle */}
      <div className="w-full flex justify-end mb-6 z-10">
        <div className="bg-gray-100 p-0.5 rounded-xl flex items-center gap-0.5 shadow-xs border border-gray-200">
          <button
            onClick={() => { props.onSetMode("Basic"); props.onSetAdvancedStep("selector"); }}
            className={`px-5 py-2 rounded-lg text-[13px] font-medium transition-all ${
              props.mode === "Basic" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800"
            }`}
          >
            Basic
          </button>
          <button
            onClick={() => props.onSetMode("Advanced")}
            className={`px-5 py-2 rounded-lg text-[13px] font-medium transition-all ${
              props.mode === "Advanced" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800"
            }`}
          >
            Advanced
          </button>
        </div>
      </div>

      {/* Streaming Status */}
      {props.isStreaming && (
        <div className="w-full mb-5 bg-amber-50 border border-amber-200 p-4 rounded-[18px] flex items-center gap-3 text-[13px] text-amber-800 z-10 shadow-xs">
          <Clock className="w-4 h-4 text-amber-500 animate-spin shrink-0" />
          <div>
            <p className="font-semibold">AI generator running…</p>
            <p className="text-[12px] text-amber-600 mt-0.5">{props.streamingProgress || "Preparing draft pipeline…"}</p>
          </div>
        </div>
      )}

      {/* Mode Content */}
      {props.mode === "Basic" ? (
        <GeneratorBasicMode
          instructions={props.instructions}
          playbookGuidelines={props.playbookGuidelines}
          depth={props.depth}
          isStreaming={props.isStreaming}
          onSetInstructions={props.onSetInstructions}
          onSetPlaybookGuidelines={props.onSetPlaybookGuidelines}
          onSetDepth={props.onSetDepth}
          onExecuteDraftStream={props.onExecuteDraftStream}
        />
      ) : (
        <div className="w-full z-10">
          {props.advancedStep === "selector" && (
            <GeneratorAdvancedSelector
              onSetAdvancedStep={props.onSetAdvancedStep}
            />
          )}

          {props.advancedStep === "reactive" && (
            <GeneratorAdvancedReactive
              isDragging={props.isDragging}
              uploadFileName={props.uploadFileName}
              advancedFields={props.advancedFields}
              advancedFieldValues={props.advancedFieldValues}
              instructions={props.instructions}
              onSetAdvancedStep={props.onSetAdvancedStep}
              onSetInstructions={props.onSetInstructions}
              onSetAdvancedFieldValues={props.onSetAdvancedFieldValues}
              onHandleDragOver={props.onHandleDragOver}
              onHandleDragLeave={props.onHandleDragLeave}
              onHandleDrop={props.onHandleDrop}
              onHandleFileChange={props.onHandleFileChange}
              onExecuteDraftStream={props.onExecuteDraftStream}
            />
          )}

          {props.advancedStep === "proactive" && (
            <GeneratorAdvancedProactive
              s1Open={props.s1Open}
              s2Open={props.s2Open}
              s3Open={props.s3Open}
              s4Open={props.s4Open}
              searchTemplateQuery={props.searchTemplateQuery}
              searchClauseQuery={props.searchClauseQuery}
              selectedTemplateName={props.selectedTemplateName}
              selectedClauses={props.selectedClauses}
              referenceInstructions={props.referenceInstructions}
              aiRulebookPrompt={props.aiRulebookPrompt}
              templateFolders={props.templateFolders}
              clauseCategories={props.clauseCategories}
              expandedFolder={props.expandedFolder}
              expandedClauseCat={props.expandedClauseCat}
              clauseTab={props.clauseTab}
              customClauseText={props.customClauseText}
              onSetAdvancedStep={props.onSetAdvancedStep}
              onSetS1Open={props.onSetS1Open}
              onSetS2Open={props.onSetS2Open}
              onSetS3Open={props.onSetS3Open}
              onSetS4Open={props.onSetS4Open}
              onSetSearchTemplateQuery={props.onSetSearchTemplateQuery}
              onSetSearchClauseQuery={props.onSetSearchClauseQuery}
              onSetSelectedTemplateName={props.onSetSelectedTemplateName}
              onSetSelectedClauses={props.onSetSelectedClauses}
              onSetReferenceInstructions={props.onSetReferenceInstructions}
              onSetAiRulebookPrompt={props.onSetAiRulebookPrompt}
              onSetExpandedFolder={props.onSetExpandedFolder}
              onSetExpandedClauseCat={props.onSetExpandedClauseCat}
              onSetClauseTab={props.onSetClauseTab}
              onSetCustomClauseText={props.onSetCustomClauseText}
              onExecuteDraftStream={props.onExecuteDraftStream}
            />
          )}
        </div>
      )}
    </div>
  );
}
