import React, { useState } from "react";
import {
  Activity, Zap, Download, Trash2, RefreshCw, Sparkles,
  Wifi, Cpu, HardDrive, Clock, Database, Server, Shield,
} from "lucide-react";
import { SettingCard, CardHeader, CardBody, CardFooter, ToggleRow } from "./SettingsPrimitives";

export default function AdvancedPanel() {
  const [debugMode, setDebugMode]       = useState(false);
  const [betaFeatures, setBetaFeatures] = useState(false);
  const [verboseLogs, setVerboseLogs]   = useState(false);

  const services = [
    { name: "Cookie Scanner API",        status: "operational", latency: "42ms",  icon: Wifi },
    { name: "Legal Analysis Engine",     status: "operational", latency: "118ms", icon: Cpu },
    { name: "Document Storage",          status: "operational", latency: "28ms",  icon: HardDrive },
    { name: "AI Inference (OpenRouter)", status: "degraded",    latency: "890ms", icon: Sparkles },
    { name: "Job Queue (BullMQ)",        status: "operational", latency: "15ms",  icon: Clock },
    { name: "Database (PostgreSQL)",     status: "operational", latency: "9ms",   icon: Database },
    { name: "RAG Retrieval Service",     status: "operational", latency: "63ms",  icon: Server },
    { name: "Vulnerability Scanner",     status: "maintenance", latency: "—",     icon: Shield },
  ];

  const statusConfig: Record<string, { label: string; badgeClass: string; dotClass: string }> = {
    operational: { label: "Operational", badgeClass: "bg-emerald-50 text-emerald-700", dotClass: "bg-emerald-500" },
    degraded:    { label: "Degraded",    badgeClass: "bg-amber-50 text-amber-700",     dotClass: "bg-amber-500 animate-pulse" },
    maintenance: { label: "Maintenance", badgeClass: "bg-gray-100 text-gray-500",      dotClass: "bg-gray-400" },
    outage:      { label: "Outage",      badgeClass: "bg-red-50 text-red-700",         dotClass: "bg-red-500 animate-pulse" },
  };

  const operationalCount = services.filter(s => s.status === "operational").length;
  const overallHealthy   = services.every(s => s.status === "operational" || s.status === "maintenance");

  return (
    <div className="space-y-5">
      <SettingCard>
        <CardHeader icon={Activity} title="Workspace Health" desc="Real-time status of all Lexify platform services." />
        <CardBody className="pb-2">
          <div className={`flex items-center gap-3 mb-5 px-4 py-3.5 rounded-xl border ${overallHealthy ? "bg-emerald-50 border-emerald-100" : "bg-amber-50 border-amber-100"}`}>
            <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${overallHealthy ? "bg-emerald-500" : "bg-amber-500 animate-pulse"}`} />
            <div>
              <p className={`text-[13px] font-semibold ${overallHealthy ? "text-emerald-800" : "text-amber-800"}`}>
                {overallHealthy ? "All systems operational" : "Minor service degradation"}
              </p>
              <p className={`text-[11px] mt-0.5 ${overallHealthy ? "text-emerald-600" : "text-amber-600"}`}>
                {operationalCount} of {services.length} services fully operational
              </p>
            </div>
            <div className="ml-auto text-right">
              <p className="text-[11px] text-gray-400">Last checked</p>
              <p className="text-[12px] font-semibold text-gray-600">Just now</p>
            </div>
          </div>
          <div className="space-y-1.5">
            {services.map((svc, i) => {
              const cfg = statusConfig[svc.status];
              const Icon = svc.icon;
              return (
                <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 transition-colors group">
                  <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                    <Icon className="w-3.5 h-3.5 text-gray-400" />
                  </div>
                  <span className="text-[13px] text-gray-700 flex-1">{svc.name}</span>
                  <span className="text-[11px] font-mono text-gray-400 mr-2 opacity-0 group-hover:opacity-100 transition-opacity">{svc.latency}</span>
                  <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold ${cfg.badgeClass}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${cfg.dotClass}`} />
                    {cfg.label}
                  </div>
                </div>
              );
            })}
          </div>
        </CardBody>
        <CardFooter>
          <p className="text-[12px] text-gray-400">Status refreshes every 60 seconds.</p>
          <button className="btn-secondary text-[13px] flex items-center gap-1.5"><RefreshCw className="w-3.5 h-3.5" /> Refresh</button>
        </CardFooter>
      </SettingCard>

      <SettingCard>
        <CardHeader icon={Zap} title="Developer Settings" desc="Debug flags, beta features and log verbosity." />
        <CardBody>
          <ToggleRow title="Debug mode" desc="Log extended trace data including API payloads and timing." checked={debugMode} onChange={setDebugMode} />
          <ToggleRow title="Beta features" desc="Opt in to experimental features before general availability." checked={betaFeatures} onChange={setBetaFeatures} />
          <ToggleRow title="Verbose AI logs" desc="Include full prompt and completion tokens in server logs." checked={verboseLogs} onChange={setVerboseLogs} />
        </CardBody>
      </SettingCard>

      <SettingCard>
        <CardHeader icon={Download} title="Data Export" desc="Export or delete all workspace data in accordance with GDPR Article 20." />
        <CardBody className="space-y-3">
          <div className="flex items-center justify-between p-4 rounded-xl border border-gray-100 bg-gray-50">
            <div>
              <p className="text-[13px] font-medium text-gray-900">Export workspace data</p>
              <p className="text-[12px] text-gray-400 mt-0.5">Download all documents, reports and settings as a ZIP archive.</p>
            </div>
            <button className="btn-secondary text-[12px] shrink-0 flex items-center gap-1.5 ml-4">
              <Download className="w-3.5 h-3.5" /> Export
            </button>
          </div>
          <div className="flex items-center justify-between p-4 rounded-xl border border-red-100 bg-red-50">
            <div>
              <p className="text-[13px] font-medium text-red-800">Delete workspace</p>
              <p className="text-[12px] text-red-500 mt-0.5">Permanently remove all data. This action cannot be undone.</p>
            </div>
            <button className="shrink-0 ml-4 flex items-center gap-1.5 bg-white border border-red-200 text-red-600 rounded-xl px-4 py-2 text-[12px] font-semibold hover:bg-red-600 hover:text-white hover:border-red-600 transition-all">
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </button>
          </div>
        </CardBody>
      </SettingCard>
    </div>
  );
}
