import React, { useState } from "react";
import { Sparkles, Cpu } from "lucide-react";
import { SettingCard, CardHeader, CardBody, CardFooter, Label, Select, ToggleRow, SavedIndicator, useSaved } from "./SettingsPrimitives";
import { AI_MODELS } from "../constants";

export default function AIPanel() {
  const [model, setModel] = useState("openai/gpt-4o");
  const [temperature, setTemperature] = useState("0.3");
  const [ragEnabled, setRagEnabled] = useState(true);
  const [streamingEnabled, setStreamingEnabled] = useState(true);
  const [citationsEnabled, setCitationsEnabled] = useState(true);
  const [safetyFilters, setSafetyFilters] = useState(true);
  const [contextWindow, setContextWindow] = useState("128k");
  const [saved, trigger] = useSaved();

  return (
    <div className="space-y-5">
      <SettingCard>
        <CardHeader icon={Sparkles} title="Model Configuration" desc="Choose which LLM powers Lexify's analysis, drafting and review agents." />
        <CardBody className="space-y-4">
          <div>
            <Label>Primary model</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
              {AI_MODELS.map(m => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setModel(m.value)}
                  className={`flex items-center justify-between px-4 py-3 rounded-xl border text-left transition-all
                    ${model === m.value
                      ? "bg-gray-900 border-gray-900 text-white shadow-sm"
                      : "bg-gray-50 border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-white"}`}
                >
                  <span className="text-[13px] font-medium">{m.label}</span>
                  {m.badge && (
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ml-2 shrink-0
                      ${model === m.value ? "bg-white/20 text-white" : "bg-gray-200 text-gray-500"}`}>
                      {m.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div>
              <Label>Temperature</Label>
              <Select value={temperature} onChange={e => setTemperature(e.target.value)}>
                <option value="0.0">0.0 — Deterministic</option>
                <option value="0.3">0.3 — Focused (recommended)</option>
                <option value="0.7">0.7 — Balanced</option>
                <option value="1.0">1.0 — Creative</option>
              </Select>
            </div>
            <div>
              <Label>Context window</Label>
              <Select value={contextWindow} onChange={e => setContextWindow(e.target.value)}>
                <option value="8k">8K tokens</option>
                <option value="32k">32K tokens</option>
                <option value="128k">128K tokens</option>
              </Select>
            </div>
          </div>
        </CardBody>
        <CardFooter>
          <p className="text-[12px] text-gray-400">Model changes apply to new sessions only.</p>
          {saved ? <SavedIndicator saved={saved} /> : <button onClick={trigger} className="btn-primary text-[13px]">Save changes</button>}
        </CardFooter>
      </SettingCard>

      <SettingCard>
        <CardHeader icon={Cpu} title="Behaviour" desc="Fine-tune how AI agents respond and present results." />
        <CardBody>
          <ToggleRow title="RAG — Document retrieval" desc="Ground AI responses in your uploaded document library for higher accuracy." checked={ragEnabled} onChange={setRagEnabled} />
          <ToggleRow title="Streaming responses" desc="Stream tokens as they are generated instead of waiting for full completion." checked={streamingEnabled} onChange={setStreamingEnabled} />
          <ToggleRow title="Inline citations" desc="Include clause references and source footnotes in AI-generated analysis." checked={citationsEnabled} onChange={setCitationsEnabled} />
          <ToggleRow title="Safety filters" desc="Apply content and legal-risk guardrails to all AI outputs." checked={safetyFilters} onChange={setSafetyFilters} />
        </CardBody>
      </SettingCard>
    </div>
  );
}
