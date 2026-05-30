import React, { useState, useEffect } from "react";
import { apiUrl } from "../config";
import { 
  Scale, 
  HeartHandshake, 
  Check, 
  X, 
  AlertTriangle, 
  MessageSquare, 
  Play, 
  ArrowRight, 
  BookOpen, 
  HelpCircle, 
  Terminal, 
  Sparkles, 
  RefreshCw,
  Search,
  ChevronDown,
  ChevronUp,
  FileText
} from "lucide-react";
import { LegalDocument, RedlineProposal } from "../types";

interface NegotiateHubProps {
  documents: LegalDocument[];
  activeDocument: LegalDocument | null;
  authToken: string;
  onRefresh: () => void;
  onSelectDocument: (doc: LegalDocument) => void;
}

interface AgentMarkup {
  clauseId: string;
  original: string;
  replacement: string;
  reasoning: string;
  riskLevel: "RED" | "YELLOW" | "GREEN";
}

export default function NegotiateHub({ 
  documents, 
  activeDocument, 
  authToken, 
  onRefresh, 
  onSelectDocument 
}: NegotiateHubProps) {
  
  const [selectedDocId, setSelectedDocId] = useState<string>(activeDocument?.id || documents[0]?.id || "");
  const [activeDoc, setActiveDoc] = useState<LegalDocument | null>(null);
  
  // Evaluated risk markups from the Multi-Agent pipeline
  const [agentMarkups, setAgentMarkups] = useState<AgentMarkup[]>([]);
  const [selectedMarkup, setSelectedMarkup] = useState<AgentMarkup | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [errorText, setErrorText] = useState("");

  // Lumi Assistant terminal state
  const [lumiOpen, setLumiOpen] = useState(true);
  const [lumiMessages, setLumiMessages] = useState<Array<{ role: "user" | "lumi" | "system", text: string }>>([
    { role: "system", text: "Lumi Active. Standing by to auto-negotiate compromise redlines..." }
  ]);
  const [chatInput, setChatInput] = useState("");
  const [draftingCompromise, setDraftingCompromise] = useState(false);

  // Manual submission state
  const [customOriginal, setCustomOriginal] = useState("");
  const [customProposed, setCustomProposed] = useState("");
  const [customComment, setCustomComment] = useState("");
  const [proposing, setProposing] = useState(false);

  // Fetch complete details of the selected document
  const loadActiveDocumentDetails = async (docId: string) => {
    if (!docId) return;
    try {
      const res = await fetch(apiUrl(`/api/documents/${docId}`), {
        headers: {
          "Authorization": `Bearer ${authToken}`
        }
      });
      if (res.ok) {
        const fullDoc = await res.json();
        setActiveDoc(fullDoc);
        // Automatically run multi-agent evaluation for the loaded contract
        runMultiAgentEvaluation(fullDoc.content);
      }
    } catch (err) {
      console.error("Error fetching document details:", err);
    }
  };

  useEffect(() => {
    const docId = activeDocument?.id || documents[0]?.id || "";
    if (docId) {
      setSelectedDocId(docId);
      loadActiveDocumentDetails(docId);
    }
  }, [activeDocument, documents]);

  const handleDocumentChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const docId = e.target.value;
    setSelectedDocId(docId);
    const matched = documents.find(d => d.id === docId);
    if (matched) {
      onSelectDocument(matched);
      loadActiveDocumentDetails(docId);
    }
  };

  // 1. RUN MULTI-AGENT EVALUATOR (Orchestration Graph Router)
  const runMultiAgentEvaluation = async (docContent: string) => {
    if (!docContent) return;
    setEvaluating(true);
    setErrorText("");
    try {
      const res = await fetch(apiUrl("/api/negotiate/evaluate"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authToken}`
        },
        body: JSON.stringify({
          content: docContent,
          documentTitle: activeDoc?.title || "Draft Contract",
          documentType: activeDoc?.type || "Agreement"
        })
      });

      const parsed = await res.json();
      if (!res.ok) {
        throw new Error(parsed.error || "Evaluation failed.");
      }

      const markups = parsed.data?.markups || [];
      setAgentMarkups(markups);
      if (markups.length > 0) {
        setSelectedMarkup(markups[0]);
      } else {
        setSelectedMarkup(null);
      }
    } catch (err: any) {
      setErrorText(err.message || "Failed to trigger multi-agent pipeline.");
    } finally {
      setEvaluating(false);
    }
  };

  // 2. ACCEPT AND PATCH MERGE AGENTIC MARKUP
  const handleAcceptAgentMarkup = async (markup: AgentMarkup) => {
    if (!activeDoc) return;
    
    // Optimistically or server-side replace content
    const originalText = markup.original;
    const proposedText = markup.replacement;
    
    try {
      // 1. First register the proposal in our backlines DB
      const pRes = await fetch(apiUrl(`/api/documents/${activeDoc.id}/redline`), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authToken}`
        },
        body: JSON.stringify({
          originalText,
          proposedText,
          comment: `[Merged via AI Multi-Agent Audit]: ${markup.reasoning}`
        })
      });

      const proposal = await pRes.json();
      if (!pRes.ok) throw new Error(proposal.error || "Failed to submit redline");

      // 2. Accept and merge the registered proposal immediately 
      const acceptRes = await fetch(apiUrl(`/api/documents/${activeDoc.id}/redline/${proposal.id}/accept`), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authToken}`
        }
      });

      if (!acceptRes.ok) {
        const errData = await acceptRes.json();
        throw new Error(errData.error || "Failed to merge changes into contract.");
      }

      // Success, remove accepted markup from state matching original text
      setAgentMarkups(prev => prev.filter(m => m.clauseId !== markup.clauseId));
      if (selectedMarkup?.clauseId === markup.clauseId) {
        setSelectedMarkup(null);
      }
      
      onRefresh();
      loadActiveDocumentDetails(activeDoc.id);

      // Tell Lumi
      setLumiMessages(prev => [
        ...prev,
        { role: "lumi", text: `Success! Merged replacement clause into active contract: "${proposedText}"` }
      ]);
    } catch (err: any) {
      alert(err.message || "Failed to accept markup patch.");
    }
  };

  // Reject / Dismiss a deviation markup
  const handleDismissMarkup = (clauseId: string) => {
    setAgentMarkups(prev => prev.filter(m => m.clauseId !== clauseId));
    if (selectedMarkup?.clauseId === clauseId) {
      setSelectedMarkup(null);
    }
  };

  // Manual counter proposal trigger
  const handleProposeCustomDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeDoc || !customOriginal.trim() || !customProposed.trim()) return;
    setProposing(true);

    try {
      const res = await fetch(apiUrl(`/api/documents/${activeDoc.id}/redline`), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authToken}`
        },
        body: JSON.stringify({
          originalText: customOriginal,
          proposedText: customProposed,
          comment: customComment || "User manual counter proposal"
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to submit custom redline");

      setCustomOriginal("");
      setCustomProposed("");
      setCustomComment("");
      
      onRefresh();
      loadActiveDocumentDetails(activeDoc.id);
      
      setLumiMessages(prev => [
        ...prev,
        { role: "lumi", text: "Your manual counter-proposal was registered and shared with the legal desk. Waiting for approval." }
      ]);
    } catch (err: any) {
      alert(err.message || "Failed to propose custom redline.");
    } finally {
      setProposing(false);
    }
  };

  // Accept a counter proposal submitted in the document database (the live ones in redlines)
  const handleAcceptDbRedline = async (rId: string) => {
    if (!activeDoc) return;
    try {
      const res = await fetch(apiUrl(`/api/documents/${activeDoc.id}/redline/${rId}/accept`), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authToken}`
        }
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Acceptance failed");
      }
      onRefresh();
      loadActiveDocumentDetails(activeDoc.id);
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Reject a counter proposal submitted in the document database (the live ones in redlines)
  const handleRejectDbRedline = async (rId: string) => {
    if (!activeDoc) return;
    try {
      const res = await fetch(apiUrl(`/api/documents/${activeDoc.id}/redline/${rId}/reject`), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authToken}`
        }
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Rejection failed");
      }
      onRefresh();
      loadActiveDocumentDetails(activeDoc.id);
    } catch (err: any) {
      alert(err.message);
    }
  };

  // 3. LUMI AUTO-NEGOTIATION COMPROMISE DIRECTIVES
  const triggerAutoNegotiation = async (playbookPreferred: boolean) => {
    if (!selectedMarkup) {
      alert("Please choose an active risk markup card first to compromise.");
      return;
    }

    setDraftingCompromise(true);
    setLumiMessages(prev => [
      ...prev,
      { role: "user", text: playbookPreferred ? "Enforce Preferred Playbook Guidelines." : "Draft Balanced Middle-Ground Compromise." }
    ]);

    try {
      const res = await fetch(apiUrl("/api/negotiate/compromise"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authToken}`
        },
        body: JSON.stringify({
          originalText: selectedMarkup.original,
          riskExplanation: selectedMarkup.reasoning,
          userPrompt: chatInput,
          playbookPreferred: playbookPreferred
        })
      });

      const parsed = await res.json();
      if (!res.ok) throw new Error(parsed.error || "Failed to generate compromise");

      const draftResult = parsed.result;
      
      // Update our selected markup with this new alternative!
      setSelectedMarkup(prev => prev ? { ...prev, replacement: draftResult } : null);
      
      // Update list as well so user sees it instantly
      setAgentMarkups(prev => prev.map(m => m.clauseId === selectedMarkup.clauseId ? { ...m, replacement: draftResult } : m));

      setLumiMessages(prev => [
        ...prev,
        { role: "lumi", text: `I have drafted a custom alternative. Review the updated "Replacement" field in the action workspace card!\n\nAlternative language drafted:\n"${draftResult}"` }
      ]);
      setChatInput("");
    } catch (err: any) {
      setLumiMessages(prev => [
        ...prev,
        { role: "system", text: "Error drafting compromise: " + err.message }
      ]);
    } finally {
      setDraftingCompromise(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !selectedMarkup) return;

    const query = chatInput;
    setLumiMessages(prev => [...prev, { role: "user", text: query }]);
    setChatInput("");
    setDraftingCompromise(true);

    try {
      const res = await fetch(apiUrl("/api/negotiate/compromise"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authToken}`
        },
        body: JSON.stringify({
          originalText: selectedMarkup.original,
          riskExplanation: selectedMarkup.reasoning,
          userPrompt: query,
          playbookPreferred: false
        })
      });

      const parsed = await res.json();
      if (!res.ok) throw new Error(parsed.error || "Failed");

      const answer = parsed.result;
      // Update replacement state 
      setSelectedMarkup(prev => prev ? { ...prev, replacement: answer } : null);
      setAgentMarkups(prev => prev.map(m => m.clauseId === selectedMarkup.clauseId ? { ...m, replacement: answer } : m));

      setLumiMessages(prev => [
        ...prev,
        { role: "lumi", text: answer }
      ]);
    } catch (err: any) {
      setLumiMessages(prev => [...prev, { role: "system", text: "Could not fetch Lumi advice: " + err.message }]);
    } finally {
      setDraftingCompromise(false);
    }
  };

  // Helper to split text by matched markups and highlight inline structural diffs
  const renderInteractiveTextPane = (text: string) => {
    if (!text) return <p className="text-gray-400 italic font-mono text-xs">Agreement text content is empty...</p>;
    
    // We want to replace each markup.original in the paragraph.
    // To do this simply while preserving structure, split by paragraphs and check if any paragraph contains a marked clause
    const paragraphs = text.split("\n\n");

    return (
      <div className="space-y-6 max-h-[640px] overflow-y-auto pr-2 bg-white rounded-lg p-5 border border-black shadow-xs font-mono text-sm leading-relaxed text-gray-800">
        {paragraphs.map((p, idx) => {
          let renderedContent: React.ReactNode = p;
          
          // Check if any agent markup matches this paragraph or a substring of it
          for (const m of agentMarkups) {
            const index = p.indexOf(m.original);
            if (index !== -1 && m.original.trim().length > 10) {
              const before = p.substring(0, index);
              const after = p.substring(index + m.original.length);
              
              renderedContent = (
                <span>
                  {before}
                  <span 
                    onClick={() => {
                      setSelectedMarkup(m);
                      // Highlight on Lumi
                      setLumiMessages(prev => [
                        ...prev,
                        { role: "system", text: `Focused on Clause: ${m.clauseId}. Ready to resolve vulnerability.` }
                      ]);
                    }}
                    className={`inline px-1 py-0.5 rounded cursor-pointer transition-all border outline-hidden ${
                      selectedMarkup?.clauseId === m.clauseId 
                        ? "border-black bg-yellow-100/90 text-gray-900 ring-2 ring-black"
                        : "border-gray-200 bg-red-50 hover:bg-yellow-50"
                    }`}
                    title="Click to load agent details in Action Workdesk"
                  >
                    <span className="line-through text-red-700 decoration-red-500 mr-1.5 font-sans">
                      {m.original}
                    </span>
                    <span className="text-emerald-800 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded font-bold text-xs inline-block font-sans">
                      → AI Playbook Proposed: {m.replacement.length > 40 ? `${m.replacement.substring(0, 40)}...` : m.replacement}
                    </span>
                  </span>
                  {after}
                </span>
              );
              break; // Handle one replacement per paragraph block for clean rendering.
            }
          }

          return (
            <p 
              key={idx} 
              className="hover:bg-zinc-50 p-2.5 rounded transition-colors"
              onClick={() => {
                // If user clicks a standard paragraph, load it as counter proposal source
                if (p && !p.includes(selectedMarkup?.original || "___")) {
                  setCustomOriginal(p.trim());
                }
              }}
              title="Click on any paragraph to load into manual counter original field"
            >
              {renderedContent}
            </p>
          );
        })}
      </div>
    );
  };

  const pendingDbRedlines = activeDoc?.redlines?.filter(r => r.status === "pending") || [];
  const resolvedDbRedlines = activeDoc?.redlines?.filter(r => r.status !== "pending") || [];
  const isLocked = activeDoc?.signatures && activeDoc.signatures.length > 0 && activeDoc.signatures.every(s => s.status === "signed");

  return (
    <div className="flex-1 overflow-y-auto p-8 font-sans bg-[#FAF9F6] min-h-screen">
      
      {/* GRID REPATTERN BACKGROUND HEADER */}
      <div className="border-b-2 border-black pb-6 mb-8 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <Scale className="w-8 h-8 text-black shrink-0" />
            <h1 className="text-3xl font-bold tracking-tight text-gray-900 font-sans uppercase">
              Negotiate Hub
            </h1>
          </div>
          <p className="text-xs text-gray-400 font-mono tracking-wider uppercase mt-1">
            Phase 3: Multi-Agent Contract Markup & Auto-Negotiation Playground
          </p>
        </div>

        {/* DOCUMENT DIRECT SELECTION */}
        {documents.length > 0 && (
          <div className="flex items-center space-x-3 bg-white border border-black p-2 rounded shadow-xs shrink-0">
            <FileText className="w-4 h-4 text-black" />
            <span className="text-[10px] font-mono font-bold uppercase text-gray-400">Target Draft:</span>
            <select
              id="negotiate-doc-dropdown"
              value={selectedDocId}
              onChange={handleDocumentChange}
              className="bg-transparent border-none text-xs font-mono font-bold text-gray-900 focus:outline-none cursor-pointer"
            >
              {documents.map((doc) => (
                <option key={doc.id} value={doc.id}>
                  {doc.title.toUpperCase()} ({doc.type})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>      {activeDoc ? (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
          
          {/* LEFT COLUMN: INTERACTIVE SPLIT PANEL AGREEMENT CANVAS */}
          <div className="xl:col-span-7 space-y-6">
            
            <div className="border border-gray-200 p-6 bg-white rounded-xl shadow-xs relative">
              <div className="absolute top-4 right-4 flex items-center space-x-2">
                <span className="text-[9px] font-mono bg-zinc-100 text-zinc-950 px-2 py-0.5 rounded border border-zinc-200 uppercase font-bold">
                  {activeDoc.type} Matrix
                </span>
                {isLocked && (
                  <span className="text-[9px] font-mono bg-red-100 text-red-800 px-2 py-0.5 rounded border border-red-350 uppercase font-bold">
                    Locked / Signed
                  </span>
                )}
              </div>

              <div className="mb-4">
                <h2 className="text-lg font-bold text-gray-900 font-sans uppercase">
                  {activeDoc.title}
                </h2>
                <p className="text-xs text-gray-400 font-mono">
                  Document ID: {activeDoc.id} • Active Version: v{activeDoc.versions?.length || 1}
                </p>
              </div>

              {/* INTERACTIVE DOCUMENT PARAGRAPH RENDERER WITH INLINE DIFFS */}
              <div className="mt-4">
                {evaluating ? (
                  <div className="h-[400px] flex flex-col items-center justify-center space-y-4 border border-dashed border-zinc-205 rounded-xl">
                    <RefreshCw className="w-8 h-8 text-black animate-spin" />
                    <p className="text-xs text-zinc-500 font-mono animate-pulse">
                      Parsing document structure strictly based on clause boundaries...
                    </p>
                  </div>
                ) : (
                  renderInteractiveTextPane(activeDoc.content)
                )}
              </div>

              <div className="mt-4 flex items-center justify-between text-[11px] font-mono text-gray-400">
                <span>⚡ Click highlights to inspect AI suggestions.</span>
                <span>Click any standard sentence to draft counter.</span>
              </div>
            </div>

            {/* MANUAL COUNTER-PROPOSAL CONSOLE */}
            {!isLocked && (
              <div className="border border-gray-200 p-6 bg-white rounded-xl shadow-xs">
                <div className="flex items-center space-x-2 mb-4 border-b border-gray-100 pb-3">
                  <HeartHandshake className="w-5 h-5 text-gray-800 shrink-0" />
                  <h3 className="font-bold text-gray-950 uppercase text-sm">
                    Manual Counter-Proposal Sandbox
                  </h3>
                </div>

                <form onSubmit={handleProposeCustomDraft} className="space-y-4">
                  <div>
                    <label className="block text-[10px] uppercase font-bold font-mono text-gray-400 mb-1">
                      Original Text To Replace:
                    </label>
                    <textarea
                      value={customOriginal}
                      onChange={(e) => setCustomOriginal(e.target.value)}
                      placeholder="Select a sentence above or type custom parts of the agreement..."
                      className="w-full bg-slate-50 border border-gray-200 p-3.5 text-xs font-mono rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-100 focus:border-slate-350 min-h-[60px]"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] uppercase font-bold font-mono text-gray-400 mb-1">
                        Proposed Replacement Text:
                      </label>
                      <textarea
                        value={customProposed}
                        onChange={(e) => setCustomProposed(e.target.value)}
                        placeholder="Type counter preferred clause text..."
                        className="w-full bg-slate-50 border border-gray-200 p-3.5 text-xs font-mono rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-100 focus:border-slate-350 min-h-[80px]"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase font-bold font-mono text-gray-400 mb-1">
                        Bargaining Rationale / Remarks:
                      </label>
                      <textarea
                        value={customComment}
                        onChange={(e) => setCustomComment(e.target.value)}
                        placeholder="Why is this exchange needed?"
                        className="w-full bg-slate-50 border border-gray-200 p-3.5 text-xs font-mono rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-100 focus:border-slate-350 min-h-[80px]"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      type="submit"
                      disabled={proposing || !customOriginal || !customProposed}
                      className="bg-[#0F172A] hover:bg-[#1E293B] text-white px-5 py-2.5 rounded-lg font-mono font-bold uppercase text-[11px] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-all"
                    >
                      {proposing ? "Proposing..." : "Submit Counter Redline"}
                    </button>
                  </div>
                </form>
              </div>
            )}

          </div>

          {/* RIGHT COLUMN: ACTION DRAWER & AI EVAL INSPECTOR */}
          <div className="xl:col-span-5 space-y-6">
            
            {/* WORK SPACE PANEL FOR SELECTED MARKUP */}
            <div className="border border-gray-200 bg-white rounded-xl p-6 shadow-xs relative">
              <div className="absolute top-4 right-4">
                <span className="text-[9px] font-mono bg-zinc-950 text-white font-bold px-2.5 py-0.5 rounded tracking-wide uppercase">
                  Agent Dashboard
                </span>
              </div>

              <h3 className="font-bold text-gray-900 border-l-4 border-black pl-3 text-sm uppercase mb-4">
                Agentic Action Workdesk
              </h3>

              {agentMarkups.length > 0 ? (
                <div className="space-y-4">
                  {/* Select Slider / Carousel list */}
                  <div className="flex items-center space-x-2 overflow-x-auto pb-2 scrollbar-none border-b border-gray-100 mb-4 text-[10px]">
                    {agentMarkups.map((m) => (
                      <button
                        key={m.clauseId}
                        onClick={() => setSelectedMarkup(m)}
                        className={`px-3 py-1.5 rounded-md font-mono font-bold uppercase tracking-wider shrink-0 border transition ${
                          selectedMarkup?.clauseId === m.clauseId
                            ? "bg-[#0F172A] text-white border-[#0F172A]"
                            : "bg-gray-100 text-gray-500 border-gray-200 hover:bg-zinc-200"
                        }`}
                      >
                        {m.clauseId.toUpperCase()} ({m.riskLevel})
                      </button>
                    ))}
                  </div>

                  {selectedMarkup ? (
                    <div className="space-y-4 animate-in fade-in duration-300">
                      
                      {/* RISK SEVERITY BADGES */}
                      <div className="flex items-center justify-between bg-zinc-50 p-2.5 border border-zinc-200 rounded-lg">
                        <span className="text-[10px] font-mono font-bold uppercase text-gray-400">
                          Severity Level:
                        </span>
                        <div className="flex items-center space-x-1.5">
                          <span className={`text-[10px] px-2.5 py-1 rounded font-mono font-bold uppercase tracking-wider ${
                            selectedMarkup.riskLevel === "RED"
                              ? "bg-red-50 text-red-800 border border-red-200"
                              : selectedMarkup.riskLevel === "YELLOW"
                              ? "bg-amber-50 text-amber-800 border border-amber-200"
                              : "bg-emerald-50 text-emerald-800 border border-emerald-200"
                          }`}>
                            {selectedMarkup.riskLevel} Severity Risk
                          </span>
                        </div>
                      </div>

                      {/* CLAUSE DIFFERENCES VISUALIZER */}
                      <div className="space-y-3">
                        <div>
                          <label className="text-[10px] font-mono font-bold uppercase text-red-400 block mb-0.5">
                            ▲ Identified Risk Clause (Original)
                          </label>
                          <div className="bg-red-50/50 border border-red-105 rounded-xl p-3 text-xs text-red-900 font-mono leading-relaxed line-through">
                            "{selectedMarkup.original}"
                          </div>
                        </div>

                        <div>
                          <label className="text-[10px] font-mono font-bold uppercase text-emerald-500 block mb-0.5">
                            ▼ Playbook Safe Alternative (Proposed)
                          </label>
                          <textarea
                            value={selectedMarkup.replacement}
                            onChange={(e) => {
                              const updatedReplacement = e.target.value;
                              setSelectedMarkup(prev => prev ? { ...prev, replacement: updatedReplacement } : null);
                              setAgentMarkups(prev => prev.map(m => m.clauseId === selectedMarkup.clauseId ? { ...m, replacement: updatedReplacement } : m));
                            }}
                            className="w-full bg-emerald-50/20 border border-emerald-200 rounded-xl p-3.5 text-xs text-emerald-950 font-mono leading-relaxed h-[95px] focus:outline-none focus:ring-2 focus:ring-emerald-100 focus:border-emerald-350 transition"
                          />
                        </div>
                      </div>

                      {/* AI ADVISORY REASONING */}
                      <div className="bg-zinc-50 border border-zinc-200 p-4 rounded text-xs space-y-1.5">
                        <span className="font-mono font-bold text-gray-400 uppercase text-[9px] block">
                          AI Analytics Guidance:
                        </span>
                        <p className="text-gray-700 leading-normal font-sans">
                          {selectedMarkup.reasoning}
                        </p>
                      </div>

                      {/* ACTION CONTROLLERS */}
                      {!isLocked && (
                        <div className="flex space-x-3 pt-2">
                          <button
                            id={`markup-accept-direct`}
                            onClick={() => handleAcceptAgentMarkup(selectedMarkup)}
                            className="flex-1 bg-black text-white hover:bg-zinc-800 rounded py-2.5 text-xs font-mono font-bold uppercase flex items-center justify-center space-x-1.5 cursor-pointer transition-colors"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Accept Patch</span>
                          </button>
                          <button
                            id={`markup-dismiss-direct`}
                            onClick={() => handleDismissMarkup(selectedMarkup.clauseId)}
                            className="border border-black text-black hover:bg-red-50 hover:text-red-600 hover:border-red-200 rounded px-4 py-2.5 text-xs font-mono font-bold uppercase flex items-center justify-center space-x-1.5 cursor-pointer transition-colors"
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>Dismiss</span>
                          </button>
                        </div>
                      )}

                    </div>
                  ) : (
                    <p className="text-zinc-400 text-xs italic font-mono text-center py-6">
                      Select any active agent markup slider to handle.
                    </p>
                  )}

                </div>
              ) : (
                <div className="py-12 text-center text-xs text-gray-400 font-mono italic border border-dashed border-zinc-200 rounded">
                  {evaluating ? (
                    <span>Parsing contract...</span>
                  ) : (
                    <div className="space-y-3 p-4">
                      <p>No active risk markups detected in memory stream.</p>
                      <button
                        onClick={() => runMultiAgentEvaluation(activeDoc.content)}
                        className="bg-black text-white px-4 py-2 text-[10px] uppercase font-bold font-mono tracking-wider hover:bg-zinc-800 rounded inline-block cursor-pointer"
                      >
                        Run Multi-Agent Evaluator
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* LIVE EXTERNAL NEGOTIATIONS BACKBURN DETAILS */}
            <div className="border border-black bg-white rounded p-5 shadow-sm text-xs">
              <span className="text-[9px] font-bold text-gray-400 font-mono uppercase block mb-3">
                Operational Counter-Proposals List (Redlines)
              </span>

              {pendingDbRedlines.length === 0 ? (
                <p className="text-gray-400 font-mono italic text-[11px]">
                  No active collaborative redlines registered in database queue. All synced.
                </p>
              ) : (
                <div className="space-y-3 max-h-[220px] overflow-y-auto">
                  {pendingDbRedlines.map((p) => (
                    <div key={p.id} className="border border-zinc-200 bg-zinc-50/50 rounded p-3 text-xs leading-normal space-y-2">
                      <div className="flex justify-between items-center text-[10px] font-mono text-zinc-400">
                        <span>Proposed by: {p.proposedByEmail}</span>
                        <span>{new Date(p.proposedAt).toLocaleDateString()}</span>
                      </div>
                      <div className="space-y-1 bg-white p-2 rounded border border-zinc-100">
                        <span className="line-through text-red-600 block text-[10px]">Orig: "{p.originalText}"</span>
                        <span className="text-emerald-700 block font-semibold text-[10px]">Proposed: "{p.proposedText}"</span>
                      </div>
                      <p className="italic text-[10px] text-zinc-500">"{p.comment}"</p>
                      
                      {!isLocked && (
                        <div className="flex space-x-2 pt-1">
                          <button
                            onClick={() => handleAcceptDbRedline(p.id)}
                            className="bg-zinc-950 text-white hover:bg-zinc-800 text-[10px] font-bold font-mono uppercase px-2 py-1 rounded cursor-pointer"
                          >
                            Accept
                          </button>
                          <button
                            onClick={() => handleRejectDbRedline(p.id)}
                            className="border border-zinc-300 text-zinc-600 hover:bg-red-50 hover:text-red-600 text-[10px] font-bold font-mono uppercase px-2 py-1 rounded cursor-pointer"
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>

        </div>
      ) : (
        <div className="bg-white border border-black rounded p-12 text-center shadow-xs">
          <HeartHandshake className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="font-bold text-gray-800 text-lg">No Active Document Selected</h3>
          <p className="text-gray-500 text-sm mt-1 max-w-sm mx-auto">
            Authorize or register an active corporate account, then initialize an NDA or DPA draft in the drafting center to negotiate counters.
          </p>
        </div>
      )}

      {/* FLOATING DRAGGABLE/SLIDING TERMINAL: LUMI ASSISTANT DESK */}
      {activeDoc && (
        <div className="fixed bottom-4 right-4 w-[380px] bg-zinc-950 text-emerald-400 rounded-lg shadow-xl border border-zinc-800 z-50 overflow-hidden font-mono text-xs">
          
          {/* HEADER ROW */}
          <div 
            onClick={() => setLumiOpen(!lumiOpen)}
            className="bg-black text-white px-4 py-3 flex items-center justify-between cursor-pointer border-b border-zinc-800 select-none"
          >
            <div className="flex items-center space-x-2">
              <Terminal className="w-4 h-4 text-emerald-400 shrink-0" />
              <div className="flex items-center space-x-1">
                <span className="font-bold tracking-wider text-[11px] uppercase">Lumi Assistant Desk</span>
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-[9px] bg-zinc-800 px-1.5 py-0.5 rounded text-gray-400">v1.2</span>
              {lumiOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </div>
          </div>

          {/* SLIDABLE CONTENT DRAWER */}
          {lumiOpen && (
            <div className="flex flex-col h-[340px] bg-zinc-950">
              
              {/* CHAT THREADS */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {lumiMessages.map((m, i) => (
                  <div key={i} className={`p-2 rounded text-[11px] leading-relaxed select-all ${
                    m.role === "system" 
                      ? "bg-zinc-900 border border-zinc-800 text-xs italic text-gray-400"
                      : m.role === "user"
                      ? "bg-zinc-850 text-white self-end text-right border-r-2 border-emerald-500"
                      : "bg-zinc-90 w bg-emerald-950/20 border-l-2 border-emerald-500 text-emerald-300"
                  }`}>
                    {m.text}
                  </div>
                ))}
                {draftingCompromise && (
                  <div className="text-[10px] text-zinc-500 italic animate-pulse">
                    Lumi reasoning engine consulting Prismavector standards...
                  </div>
                )}
              </div>

              {/* AUTOMATION TRIGGERS FOR SELECTED CLAUSE */}
              {selectedMarkup && (
                <div className="p-2.5 bg-black border-t border-zinc-800 space-y-2 shrink-0">
                  <div className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold">
                    Target Clause: {selectedMarkup.clauseId.toUpperCase()}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => triggerAutoNegotiation(false)}
                      className="bg-zinc-900 border border-zinc-700 hover:bg-zinc-850 hover:border-zinc-500 py-1.5 px-2 rounded font-bold text-[9px] uppercase tracking-wide text-zinc-200 flex items-center justify-center space-x-1 cursor-pointer"
                    >
                      <Sparkles className="w-3 h-3 text-amber-400" />
                      <span>Draft Compromise</span>
                    </button>
                    <button
                      onClick={() => triggerAutoNegotiation(true)}
                      className="bg-emerald-950/40 border border-emerald-800 text-emerald-300 hover:bg-emerald-900 hover:text-white py-1.5 px-2 rounded font-bold text-[9px] uppercase tracking-wide flex items-center justify-center space-x-1 cursor-pointer"
                    >
                      <BookOpen className="w-3 h-3" />
                      <span>Enforce Playbook</span>
                    </button>
                  </div>
                </div>
              )}

              {/* INPUT BOX FORM */}
              <form onSubmit={handleSendMessage} className="p-2 bg-zinc-950 border-t border-zinc-805 flex space-x-1.5 shrink-0">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder={selectedMarkup ? "Tell Lumi to draft a custom compromise..." : "Select an active markup above to write custom counters..."}
                  disabled={!selectedMarkup || draftingCompromise}
                  className="flex-1 bg-black text-emerald-300 placeholder-zinc-650 border border-zinc-800 focus:outline-none focus:border-zinc-500 text-xs p-2 rounded rounded-r-none font-mono disabled:bg-zinc-900 disabled:placeholder-zinc-800"
                />
                <button
                  type="submit"
                  disabled={!selectedMarkup || draftingCompromise}
                  className="bg-emerald-600 text-black px-3 py-2 rounded rounded-l-none font-bold text-xs hover:bg-emerald-500 transition-colors disabled:bg-zinc-800 disabled:text-zinc-600 inline-block cursor-pointer"
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </form>

            </div>
          )}

        </div>
      )}

    </div>
  );
}
