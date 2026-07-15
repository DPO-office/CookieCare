// import React from "react";
// import {
//   HelpCircle,
//   ChevronDown,
//   ChevronUp,
//   ChevronRight,
//   FileText,
//   Upload,
//   Search,
//   Plus,
//   Check,
//   CheckCircle,
//   FileEdit,
//   ArrowRight,
// } from "lucide-react";
// import { AdvancedStep, ClauseTab, TemplateFolder, ClauseCategory } from "../types";

// interface GeneratorAdvancedProactiveProps {
//   s1Open: boolean;
//   s2Open: boolean;
//   s3Open: boolean;
//   s4Open: boolean;
//   searchTemplateQuery: string;
//   searchClauseQuery: string;
//   selectedTemplateName: string | null;
//   selectedClauses: string[];
//   referenceInstructions: string;
//   aiRulebookPrompt: string;
//   templateFolders: TemplateFolder[];
//   clauseCategories: ClauseCategory[];
//   expandedFolder: string | null;
//   expandedClauseCat: string | null;
//   clauseTab: ClauseTab;
//   customClauseText: string;
//   onSetAdvancedStep: (step: AdvancedStep) => void;
//   onSetS1Open: (open: boolean) => void;
//   onSetS2Open: (open: boolean) => void;
//   onSetS3Open: (open: boolean) => void;
//   onSetS4Open: (open: boolean) => void;
//   onSetSearchTemplateQuery: (q: string) => void;
//   onSetSearchClauseQuery: (q: string) => void;
//   onSetSelectedTemplateName: (name: string | null) => void;
//   onSetSelectedClauses: (clauses: string[]) => void;
//   onSetReferenceInstructions: (inst: string) => void;
//   onSetAiRulebookPrompt: (prompt: string) => void;
//   onSetExpandedFolder: (folder: string | null) => void;
//   onSetExpandedClauseCat: (cat: string | null) => void;
//   onSetClauseTab: (tab: ClauseTab) => void;
//   onSetCustomClauseText: (text: string) => void;
//   onExecuteDraftStream: () => void;
// }

// export default function GeneratorAdvancedProactive({
//   s1Open, s2Open, s3Open, s4Open,
//   searchTemplateQuery, searchClauseQuery,
//   selectedTemplateName, selectedClauses,
//   referenceInstructions, aiRulebookPrompt,
//   templateFolders, clauseCategories,
//   expandedFolder, expandedClauseCat,
//   clauseTab, customClauseText,
//   onSetAdvancedStep, onSetS1Open, onSetS2Open, onSetS3Open, onSetS4Open,
//   onSetSearchTemplateQuery, onSetSearchClauseQuery,
//   onSetSelectedTemplateName, onSetSelectedClauses,
//   onSetReferenceInstructions, onSetAiRulebookPrompt,
//   onSetExpandedFolder, onSetExpandedClauseCat,
//   onSetClauseTab, onSetCustomClauseText,
//   onExecuteDraftStream,
// }: GeneratorAdvancedProactiveProps) {
//   const accHdr = "p-4 px-5 bg-white hover:bg-gray-50 flex items-center justify-between border-b border-gray-100 cursor-pointer text-[13px] font-semibold text-gray-900 select-none";
//   return (
//     <div className="space-y-4">

//       {/* Intro box */}
//       <div className="bg-white border border-gray-200 p-5 rounded-[18px] shadow-xs flex justify-between items-center">
//         <div>
//           <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block mb-1">Drafting Intake</span>
//           <h2 className="text-[15px] font-bold text-gray-900">Proactive drafting</h2>
//           <p className="text-[12px] text-gray-500 mt-0.5">Create a first-instance draft — contract, agreement, petition, or any legal document.</p>
//         </div>
//         <button
//           onClick={() => onSetAdvancedStep("selector")}
//           className="px-3.5 py-2 border border-gray-200 hover:bg-gray-50 bg-white rounded-xl text-[12px] font-semibold text-gray-700 shadow-xs transition cursor-pointer"
//         >
//           Change mode
//         </button>
//       </div>

//       {/* ACCORDION 1: Template */}
//       <div className="border border-gray-200 rounded-[18px] bg-white shadow-xs overflow-hidden">
//         <div
//           onClick={() => onSetS1Open(!s1Open)}
//           className={accHdr}
//         >
//           <div className="flex items-center gap-2">
//             <span className="text-gray-400 text-[12px] font-medium">1</span>
//             <span>Would you like to use a template?</span>
//             <HelpCircle className="w-3.5 h-3.5 text-gray-400" />
//           </div>
//           <div className="flex items-center gap-3 text-[11px] text-gray-400 font-medium">
//             <span className="bg-gray-50 border border-gray-200 rounded-md px-2 py-0.5 text-[10px]">Optional</span>
//             {s1Open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
//           </div>
//         </div>

//         {s1Open && (
//           <div className="p-5 space-y-4">
//             <p className="text-[12px] text-gray-500">Choose from Lexify templates or your uploaded templates.</p>

//             <div className="flex gap-2">
//               <div className="relative flex-1">
//                 <input
//                   type="text"
//                   value={searchTemplateQuery}
//                   onChange={(e) => onSetSearchTemplateQuery(e.target.value)}
//                   placeholder="Search templates"
//                   className="w-full bg-white border border-gray-200 rounded-xl pl-9 pr-4 py-2.5 text-[12px] text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-100"
//                 />
//                 <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-2.5" />
//               </div>
//               <button className="px-3.5 py-2 border border-gray-200 hover:bg-gray-50 rounded-xl text-[12px] font-semibold text-gray-700 shadow-xs flex items-center gap-1.5 hover:border-gray-300 transition cursor-pointer">
//                 <Plus className="w-3.5 h-3.5 text-gray-500" />
//                 <span>Upload Template(s)</span>
//               </button>
//             </div>

//             <div className="border border-gray-100 rounded-xl overflow-hidden divide-y divide-gray-100">
//               {templateFolders.map((folder) => {
//                 const isFolderExpanded = expandedFolder === folder.name;
//                 return (
//                   <div key={folder.name} className="bg-white">
//                     <div
//                       onClick={() => onSetExpandedFolder(isFolderExpanded ? null : folder.name)}
//                       className="p-3 px-4 hover:bg-gray-50 flex items-center justify-between cursor-pointer select-none text-[12px] font-semibold text-gray-700"
//                     >
//                       <div className="flex items-center gap-2">
//                         <FileText className="w-3.5 h-3.5 text-gray-400" />
//                         <span>{folder.name}</span>
//                       </div>
//                       <div className="flex items-center gap-2 text-gray-400">
//                         <span className="bg-gray-100 text-gray-500 text-[10px] rounded-full px-2 py-0.5">{folder.count}</span>
//                         <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isFolderExpanded ? "rotate-90" : ""}`} />
//                       </div>
//                     </div>

//                     {isFolderExpanded && (
//                       <div className="bg-gray-50/50 p-2 pl-8 divide-y divide-gray-100">
//                         {folder.items
//                           .filter(it => it.toLowerCase().includes(searchTemplateQuery.toLowerCase()))
//                           .map((item) => {
//                             const isSelected = selectedTemplateName === item;
//                             return (
//                               <div
//                                 key={item}
//                                 onClick={() => onSetSelectedTemplateName(item)}
//                                 className="p-2.5 flex items-center justify-between cursor-pointer text-[12px] select-none hover:text-gray-900"
//                               >
//                                 <span className={isSelected ? "font-bold text-gray-900" : "text-gray-500"}>{item}</span>
//                                 {isSelected && (
//                                   <span className="bg-gray-900 text-white rounded-full p-0.5"><Check className="w-3 h-3" /></span>
//                                 )}
//                               </div>
//                             );
//                           })
//                         }
//                       </div>
//                     )}
//                   </div>
//                 );
//               })}
//             </div>
//           </div>
//         )}
//       </div>

//       {/* ACCORDION 2: Reference files */}
//       <div className="border border-gray-200 rounded-[18px] bg-white shadow-xs overflow-hidden">
//         <div onClick={() => onSetS2Open(!s2Open)} className={accHdr}>
//           <div className="flex items-center gap-2">
//             <span className="text-gray-400 text-[12px] font-medium">2</span>
//             <span>Select reference file(s) if any</span>
//             <HelpCircle className="w-3.5 h-3.5 text-gray-400" />
//           </div>
//           <div className="flex items-center gap-3 text-[11px] text-gray-400 font-medium">
//             <span className="bg-gray-50 border border-gray-200 rounded-md px-2 py-0.5 text-[10px]">Optional</span>
//             {s2Open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
//           </div>
//         </div>
//         {s2Open && (
//           <div className="p-5 space-y-4">
//             <p className="text-[12px] text-gray-500">Select reference files and mention what should be referred to from the file(s).</p>
//             <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 bg-gray-50 text-center">
//               <Upload className="w-8 h-8 text-gray-300 mx-auto mb-2" />
//               <p className="text-[13px] font-semibold text-gray-600">Drag & drop reference guidelines or PDF</p>
//               <p className="text-[11px] text-gray-400 mt-0.5">Vetted for AI parsing context</p>
//             </div>
//             <div className="space-y-1.5">
//               <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider">What to refer from attached files?</label>
//               <textarea
//                 rows={3}
//                 value={referenceInstructions}
//                 onChange={(e) => onSetReferenceInstructions(e.target.value)}
//                 placeholder="e.g., Use the indemnity clause structure from Document 1, pricing format from Document 2..."
//                 className="w-full border border-gray-200 rounded-xl p-3.5 text-[13px] text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-100 bg-gray-50/50"
//               />
//             </div>
//           </div>
//         )}
//       </div>

//       {/* ACCORDION 3: Clauses */}
//       <div className="border border-gray-200 rounded-[18px] bg-white shadow-xs overflow-hidden">
//         <div onClick={() => onSetS3Open(!s3Open)} className={accHdr}>
//           <div className="flex items-center gap-2">
//             <span className="text-gray-400 text-[12px] font-medium">3</span>
//             <span>Include specific clauses or paragraphs?</span>
//             <HelpCircle className="w-3.5 h-3.5 text-gray-400" />
//           </div>
//           <div className="flex items-center gap-3 text-[11px] text-gray-400 font-medium">
//             <span className="bg-gray-50 border border-gray-200 rounded-md px-2 py-0.5 text-[10px]">Optional</span>
//             {s3Open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
//           </div>
//         </div>
//         {s3Open && (
//           <div className="p-5 space-y-4">
//             <p className="text-[12px] text-gray-500">Use preset clauses from the library or write your own custom clauses.</p>
//             <div className="flex border-b border-gray-100">
//               <button onClick={() => onSetClauseTab("clauses")} className={`py-2.5 px-4 text-[12px] font-semibold transition border-b-2 flex items-center gap-1.5 cursor-pointer ${clauseTab === "clauses" ? "border-gray-900 text-gray-900" : "border-transparent text-gray-400 hover:text-gray-700"}`}>
//                 <CheckCircle className="w-3.5 h-3.5" />
//                 <span>Clauses</span>
//               </button>
//               <button onClick={() => onSetClauseTab("custom")} className={`py-2.5 px-4 text-[12px] font-semibold transition border-b-2 flex items-center gap-1.5 cursor-pointer ${clauseTab === "custom" ? "border-gray-900 text-gray-900" : "border-transparent text-gray-400 hover:text-gray-700"}`}>
//                 <FileEdit className="w-3.5 h-3.5" />
//                 <span>Make your own</span>
//               </button>
//             </div>
//             {clauseTab === "clauses" ? (
//               <div className="space-y-3">
//                 <div className="flex gap-2">
//                   <div className="relative flex-1">
//                     <input type="text" value={searchClauseQuery} onChange={(e) => onSetSearchClauseQuery(e.target.value)} placeholder="Search clauses" className="w-full bg-white border border-gray-200 rounded-xl pl-9 py-2.5 text-[12px] text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-100" />
//                     <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-2.5" />
//                   </div>
//                   <button className="px-3.5 py-2 border border-gray-200 hover:bg-gray-50 bg-white rounded-xl text-[12px] font-semibold text-gray-700 flex items-center gap-1.5 shadow-xs transition cursor-pointer">
//                     <Plus className="w-3.5 h-3.5 text-gray-500" /><span>Add Clause</span>
//                   </button>
//                 </div>
//                 <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
//                   {clauseCategories.map((cat) => {
//                     const isCatExpanded = expandedClauseCat === cat.name;
//                     return (
//                       <div key={cat.name} className="border border-gray-100 rounded-xl overflow-hidden bg-white">
//                         <div onClick={() => onSetExpandedClauseCat(isCatExpanded ? null : cat.name)} className="p-3 px-4 hover:bg-gray-50 flex justify-between items-center cursor-pointer text-[12px] font-semibold text-gray-700 select-none">
//                           <div className="flex items-center gap-2">
//                             <input type="checkbox" className="rounded" onClick={(e) => e.stopPropagation()} />
//                             <span>{cat.name}</span>
//                           </div>
//                           <div className="flex items-center gap-1.5 text-gray-400 shrink-0">
//                             <span className="bg-gray-100 text-gray-500 rounded-full px-1.5 text-[10px]">{cat.count}</span>
//                             <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isCatExpanded ? "rotate-90" : ""}`} />
//                           </div>
//                         </div>
//                         {isCatExpanded && (
//                           <div className="bg-gray-50 p-2 pl-8 space-y-1.5">
//                             {cat.items.map((sub) => {
//                               const itemChecked = selectedClauses.includes(sub);
//                               return (
//                                 <div key={sub} onClick={() => { if (itemChecked) onSetSelectedClauses(selectedClauses.filter(v => v !== sub)); else onSetSelectedClauses([...selectedClauses, sub]); }} className="flex items-center gap-2 text-[11px] text-gray-500 hover:text-gray-900 cursor-pointer py-1 select-none">
//                                   <input type="checkbox" checked={itemChecked} readOnly className="rounded" />
//                                   <span>{sub}</span>
//                                 </div>
//                               );
//                             })}
//                           </div>
//                         )}
//                       </div>
//                     );
//                   })}
//                 </div>
//               </div>
//             ) : (
//               <textarea rows={4} value={customClauseText} onChange={(e) => onSetCustomClauseText(e.target.value)} placeholder="Type down special legal clauses or customized parameters you want to embed inside this first draft..." className="w-full border border-gray-200 rounded-xl p-3.5 text-[13px] text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-100 bg-gray-50/50" />
//             )}
//           </div>
//         )}
//       </div>

//       {/* ACCORDION 4: AI Rulebook */}
//       <div className="border border-gray-200 rounded-[18px] bg-white shadow-xs overflow-hidden">
//         <div onClick={() => onSetS4Open(!s4Open)} className={accHdr}>
//           <div className="flex items-center gap-2">
//             <span className="text-gray-400 text-[12px] font-medium">4</span>
//             <span>Should the draft follow any AI Rulebook?</span>
//             <HelpCircle className="w-3.5 h-3.5 text-gray-400" />
//           </div>
//           <div className="flex items-center gap-3 text-[11px] text-gray-400 font-medium">
//             <span className="bg-gray-50 border border-gray-200 rounded-md px-2 py-0.5 text-[10px]">Optional</span>
//             {s4Open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
//           </div>
//         </div>
//         {s4Open && (
//           <div className="p-5">
//             <p className="text-[12px] text-gray-500 mb-3">List down important do's and don'ts for the draft.</p>
//             <textarea rows={3} value={aiRulebookPrompt} onChange={(e) => onSetAiRulebookPrompt(e.target.value)} placeholder="e.g. Do not include strict technology lock-in rules. Governing law defaults to Delhi High Court..." className="w-full border border-gray-200 rounded-xl p-3.5 text-[13px] text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-100 bg-gray-50/50" />
//           </div>
//         )}
//       </div>

//       {/* Generate action */}
//       <div className="pt-4 border-t border-gray-100 flex justify-end">
//         <button onClick={onExecuteDraftStream} className="inline-flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white text-[13px] font-semibold px-6 py-2.5 rounded-xl transition shadow-xs hover:shadow-sm cursor-pointer">
//           <span>Generate draft</span>
//           <ArrowRight className="w-4 h-4" />
//         </button>
//       </div>

//     </div>
//   );
// }

// As Proactive mode rihgt now taking companies playbook and claues by default
import React from "react";
import { HelpCircle, ChevronDown, ArrowRight } from "lucide-react";
import { DraftDepth } from "../types";

interface GeneratorBasicModeProps {
  instructions: string;
  playbookGuidelines: string;
  depth: DraftDepth;
  isStreaming: boolean;
  onSetInstructions: (inst: string) => void;
  onSetPlaybookGuidelines: (guide: string) => void;
  onSetDepth: (depth: DraftDepth) => void;
  onExecuteDraftStream: () => void;
}

export default function GeneratorBasicMode({
  instructions,
  playbookGuidelines,
  depth,
  isStreaming,
  onSetInstructions,
  onSetPlaybookGuidelines,
  onSetDepth,
  onExecuteDraftStream,
}: GeneratorBasicModeProps) {
  return (
    <div className="w-full space-y-5 z-10">
      <div className="rounded-[18px] border border-emerald-100 bg-emerald-50/70 px-4 py-3 text-[12px] text-emerald-900 shadow-xs">
        <div className="flex items-start gap-2">
          
          <p className="leading-5">
            <span className="font-semibold">Proactive Mode</span> is active. Your draft is being automatically aligned with your organization’s primary playbook standards, approved clause libraries, and risk guardrails.
            <span className="block mt-1.5 text-emerald-700/90">
              <span className="font-semibold text-emerald-800">Coming soon:</span> A dynamic Vault selector to swap playbooks, inject custom clauses, and load target context before you generate.
            </span>
          </p>
        </div>
      </div>

      {/* 1. Provide draft input */}
      <div className="bg-white border border-gray-200 rounded-[18px] p-6 shadow-xs space-y-3">
        <div className="flex items-center gap-2.5">
          <div className="w-5 h-5 rounded-full bg-gray-900 text-white flex items-center justify-center text-[10px] font-bold shrink-0">1</div>
          <h3 className="text-[13px] font-semibold text-gray-900">Provide draft input <span className="text-red-400">*</span></h3>
          <HelpCircle className="w-3.5 h-3.5 text-gray-400" />
        </div>
        <p className="text-[12px] text-gray-500 ml-7.5">Define what you want to create and provide the necessary context.</p>
        <textarea
          rows={4}
          value={instructions}
          onChange={(e) => onSetInstructions(e.target.value)}
          placeholder="e.g. Draft a reply to a breach notice, a shareholder agreement with vesting terms, or a legal notice based on the attached facts."
          className="w-full bg-gray-50 border border-gray-200 rounded-xl p-4 text-[13px] text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-100 focus:border-gray-300 transition resize-none"
        />
      </div>

      {/* 2. Set drafting instructions */}
      <div className="bg-white border border-gray-200 rounded-[18px] p-6 shadow-xs space-y-3">
        <div className="flex items-center gap-2.5">
          <div className="w-5 h-5 rounded-full bg-gray-900 text-white flex items-center justify-center text-[10px] font-bold shrink-0">2</div>
          <h3 className="text-[13px] font-semibold text-gray-900">Set drafting instructions</h3>
          <HelpCircle className="w-3.5 h-3.5 text-gray-400" />
        </div>
        <p className="text-[12px] text-gray-500 ml-7.5">Set tone, structure, and any specific requirements.</p>
        <textarea
          rows={4}
          value={playbookGuidelines}
          onChange={(e) => onSetPlaybookGuidelines(e.target.value)}
          placeholder="e.g. Use formal legal tone, favour the client, include strong indemnity and limitation clauses."
          className="w-full bg-gray-50 border border-gray-200 rounded-xl p-4 text-[13px] text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-100 focus:border-gray-300 transition resize-none"
        />
      </div>

      {/* 3. Output detail level */}
      <div className="bg-white border border-gray-200 rounded-[18px] p-6 shadow-xs space-y-3 max-w-sm">
        <div className="flex items-center gap-2.5">
          <div className="w-5 h-5 rounded-full bg-gray-900 text-white flex items-center justify-center text-[10px] font-bold shrink-0">3</div>
          <h3 className="text-[13px] font-semibold text-gray-900">Output detail level</h3>
        </div>
        <div className="relative">
          <select
            value={depth}
            onChange={(e: any) => onSetDepth(e.target.value)}
            className="w-full appearance-none bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-[13px] text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-100 focus:border-gray-300 transition cursor-pointer"
          >
            <option value="Short">Short output (~500 words)</option>
            <option value="Standard">Standard format (~1,000 words)</option>
            <option value="Deep">Detailed output (~1,500–2,000 words)</option>
          </select>
          <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3.5 top-3 pointer-events-none" />
        </div>
      </div>

      {/* Submit */}
      <div className="pt-2 pb-8 flex justify-start">
        <button
          onClick={onExecuteDraftStream}
          disabled={isStreaming}
          className="inline-flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white text-[13px] font-semibold px-6 py-2.5 rounded-xl transition shadow-xs hover:shadow-sm disabled:opacity-40 cursor-pointer"
        >
          <span>Generate draft</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
