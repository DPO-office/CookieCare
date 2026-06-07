import React, { useState } from "react";
import { User, Key, Shield, Settings, CheckCircle, Bell, Globe, Sparkles } from "lucide-react";

interface SettingsProps {
  user: { name: string; email: string } | null;
}

export default function SettingsView({ user }: SettingsProps) {
  const [name, setName] = useState(user?.name || "Senior Privacy Engineer");
  const [email, setEmail] = useState(user?.email || "admin@privsecai.cloud");
  const [saved, setSaved] = useState(false);

  // Configured states
  const [jurisdiction, setJurisdiction] = useState<"GDPR" | "CCPA" | "DPDP" | "ALL">("ALL");
  const [alertFrequency, setAlertFrequency] = useState<"immediate" | "daily" | "weekly">("immediate");
  const [continuousScanning, setContinuousScanning] = useState(true);

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="flex-1 overflow-y-auto p-10 font-sans grid-bg min-h-screen">
      
      {/* HEADER */}
      <div className="mb-10 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-display font-bold text-gray-900 tracking-tight">
            Settings
          </h1>
          <p className="text-sm text-gray-500 font-mono tracking-wider uppercase mt-1">
            System Preferences, Keys & Regulatory Scopes
          </p>
        </div>
        <div className="flex items-center space-x-2 text-xs font-mono text-gray-500 bg-white shadow-xs border border-gray-200/60 rounded-full py-1.5 px-3">
          <Settings className="w-4 h-4 text-gray-900" />
          <span>Active Configuration Node</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* LEFT 2 COLUMNS: CONFIGURATION FORM */}
        <div className="lg:col-span-2 space-y-8">
          
          <form onSubmit={handleSaveSettings} className="bg-white border-2 border-black p-6 md:p-8 rounded-none space-y-6">
            <h2 className="text-lg font-display font-bold text-gray-900 uppercase tracking-tight border-b-2 border-black pb-3 flex items-center space-x-2">
              <User className="w-5 h-5" />
              <span>Identity Profile management</span>
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 font-mono text-xs">
              <div>
                <label className="block text-black font-bold uppercase tracking-wider mb-2">Display Name</label>
                <input
                  type="text"
                  required
                  className="w-full bg-white text-black border-2 border-black py-3 px-3 font-semibold focus:outline-none"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-black font-bold uppercase tracking-wider mb-2">Email Address</label>
                <input
                  type="email"
                  required
                  disabled
                  title="Signed-in email address is permanently secured"
                  className="w-full bg-gray-50 text-gray-400 border border-gray-200 py-3 px-3 font-semibold focus:outline-none cursor-not-allowed"
                  value={email}
                />
              </div>
            </div>

            <h2 className="text-lg font-display font-bold text-gray-900 uppercase tracking-tight border-b-2 border-black pb-3 pt-4 flex items-center space-x-2">
              <Shield className="w-5 h-5" />
              <span>Regulatory Jurisdictions & Scope</span>
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 font-mono text-xs">
              <div>
                <label className="block text-black font-bold uppercase tracking-wider mb-2">Target Regulation Focus</label>
                <select
                  className="w-full bg-white text-black border-2 border-black py-3 px-3 font-semibold focus:outline-none"
                  value={jurisdiction}
                  onChange={(e) => setJurisdiction(e.target.value as any)}
                >
                  <option value="ALL">Global Standard Alignment (GDPR + CCPA + DPDP)</option>
                  <option value="GDPR">GDPR Scope (European Union Focus Only)</option>
                  <option value="CCPA">CCPA-Scope (California Consumers Privacy Act)</option>
                  <option value="DPDP">DPDP scope (Digital Personal Data Protection)</option>
                </select>
              </div>

              <div>
                <label className="block text-black font-bold uppercase tracking-wider mb-2">Compliance Alert Tier</label>
                <select
                  className="w-full bg-white text-black border-2 border-black py-3 px-3 font-semibold focus:outline-none"
                  value={alertFrequency}
                  onChange={(e) => setAlertFrequency(e.target.value as any)}
                >
                  <option value="immediate">Immediate Critical Triggers</option>
                  <option value="daily">Daily Compliance Wrap-ups</option>
                  <option value="weekly">Weekly High-Level Audits</option>
                </select>
              </div>
            </div>

            <div className="pt-2">
              <label className="flex items-center space-x-3.5 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-5 h-5 accent-black border-2 border-black cursor-pointer rounded-none focus:ring-0"
                  checked={continuousScanning}
                  onChange={(e) => setContinuousScanning(e.target.checked)}
                />
                <div>
                  <span className="text-xs font-mono font-bold text-black uppercase tracking-wider">Continuous Background Scans</span>
                  <p className="text-[11px] text-gray-500 leading-normal">
                    Automate scraping checks every 24 hours to generate passive compliance logs and check for rogue marketers.
                  </p>
                </div>
              </label>
            </div>

            <div className="border-t-2 border-black pt-5 flex items-center justify-between">
              {saved && (
                <span className="text-emerald-700 text-xs font-mono font-bold flex items-center space-x-1.5 animate-pulse">
                  <CheckCircle className="w-4 h-4" />
                  <span>Changes securely recorded.</span>
                </span>
              )}
              <button
                type="submit"
                className="ml-auto bg-black text-white hover:bg-gray-900 border-2 border-black py-3 px-8 font-mono font-bold text-xs uppercase tracking-wider transition-all cursor-pointer shadow-md"
              >
                Persist Preferences
              </button>
            </div>
          </form>

        </div>

        {/* RIGHT 1 COLUMN: KEYS PROFILE INFO */}
        <div className="space-y-6 font-mono text-xs text-gray-900">
          
          <div className="bg-white border-2 border-black p-6 rounded-none">
            <h3 className="text-base font-display font-bold uppercase mb-4 tracking-tight flex items-center space-x-2 border-b-2 border-black pb-2">
              <Key className="w-5 h-5 text-black" />
              <span>Cryptographic Keys</span>
            </h3>
            <p className="text-[11px] text-gray-500 leading-relaxed mb-4">
              PrivSecAI AI cryptographically signs consensus audits with local cryptographic anchors.
            </p>
            <div className="space-y-4 font-mono text-[11px]">
              <div className="p-3 bg-gray-50 border border-gray-200">
                <span className="text-[10px] text-gray-400 font-bold uppercase block mb-1">ANCHOR STATE LOG</span>
                <span className="text-xs text-gray-800 font-bold break-all">LAES_7FCA8E93_B1D2...</span>
              </div>
              <div className="p-3 bg-gray-50 border border-gray-200">
                <span className="text-[10px] text-gray-400 font-bold uppercase block mb-1">TELEMETRY SECURE ID</span>
                <span className="text-xs text-gray-800 font-bold break-all">fips-sc-node-184-a</span>
              </div>
            </div>
          </div>

          <div className="bg-white border-2 border-black p-6 rounded-none">
            <h3 className="text-base font-display font-bold uppercase mb-4 tracking-tight flex items-center space-x-2 border-b-2 border-black pb-2">
              <Globe className="w-4.5 h-4.5 text-black" />
              <span>Compliance Scope</span>
            </h3>
            <div className="space-y-3 font-sans text-xs">
              <div className="flex justify-between items-center">
                <span className="text-gray-500">Cookie Scanner API Node</span>
                <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-mono font-bold text-[9px]">ONLINE</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-500">Security Header Audit Host</span>
                <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-mono font-bold text-[9px]">ONLINE</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-500">FIPS Cryptographic Module</span>
                <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-mono font-bold text-[9px]">CERTIFIED</span>
              </div>
              <p className="text-[10px] text-gray-400 leading-relaxed pt-2 border-t border-gray-100 font-mono">
                Updates directly synchronized with security nodes securely. No actions required.
              </p>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
