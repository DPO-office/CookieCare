import React, { useState } from "react";
import {
  User, Shield, Lock, Sparkles, Bell, Layers, Zap,
  CheckCircle, ChevronRight, Globe, Activity, Database,
  Key, Eye, EyeOff, Cpu,
  Server, Wifi, HardDrive, Clock,
  Mail, Smartphone, Webhook, Building2, Users, CreditCard,
  Trash2, Download, RefreshCw, Check
} from "lucide-react";

interface SettingsProps {
  user: { name: string; email: string } | null;
}

type SettingsSection =
  | "general"
  | "privacy"
  | "security"
  | "ai"
  | "notifications"
  | "workspace"
  | "advanced";

const NAV_ITEMS: { id: SettingsSection; label: string; icon: React.ElementType; desc: string }[] = [
  { id: "general",       label: "General",         icon: User,     desc: "Profile & display preferences" },
  { id: "privacy",       label: "Privacy",         icon: Shield,   desc: "Data handling & compliance scope" },
  { id: "security",      label: "Security",        icon: Lock,     desc: "Authentication & access control" },
  { id: "ai",            label: "AI Configuration",icon: Sparkles, desc: "Models, prompts & behaviour" },
  { id: "notifications", label: "Notifications",   icon: Bell,     desc: "Alerts, digests & webhooks" },
  { id: "workspace",     label: "Workspace",       icon: Layers,   desc: "Team, billing & integrations" },
  { id: "advanced",      label: "Advanced",        icon: Zap,      desc: "Developer tools & system health" },
];

/* ─── Reusable primitives ─────────────────────────────────────────────────── */

function SettingCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white border border-gray-200 rounded-[18px] shadow-xs overflow-hidden ${className}`}>
      {children}
    </div>
  );
}

function CardHeader({ icon: Icon, title, desc }: { icon: React.ElementType; title: string; desc?: string }) {
  return (
    <div className="px-6 py-5 border-b border-gray-100 flex items-start gap-3">
      <div className="w-8 h-8 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0 mt-0.5">
        <Icon className="w-4 h-4 text-gray-500" />
      </div>
      <div>
        <h3 className="font-semibold text-[14px] text-gray-900 leading-tight">{title}</h3>
        {desc && <p className="text-[12px] text-gray-400 mt-0.5 leading-relaxed">{desc}</p>}
      </div>
    </div>
  );
}

function CardBody({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`px-6 py-5 ${className}`}>{children}</div>;
}

function CardFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between gap-3">
      {children}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
      {children}
    </label>
  );
}

function Input({ className = "", ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full bg-gray-50 border border-gray-200 rounded-xl py-2.5 px-3.5 text-[13px] text-gray-900
        focus:bg-white focus:outline-none focus:ring-2 focus:ring-gray-100 focus:border-gray-300 transition
        placeholder:text-gray-400 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      {...props}
    />
  );
}

function Select({ children, className = "", ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`w-full bg-gray-50 border border-gray-200 rounded-xl py-2.5 px-3.5 text-[13px] text-gray-900
        focus:bg-white focus:outline-none focus:ring-2 focus:ring-gray-100 focus:border-gray-300 transition
        appearance-none cursor-pointer ${className}`}
      {...props}
    >
      {children}
    </select>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent
        transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900
        ${checked ? "bg-gray-900" : "bg-gray-200"}`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm
          transition duration-200 ${checked ? "translate-x-4" : "translate-x-0"}`}
      />
    </button>
  );
}

function ToggleRow({
  title, desc, checked, onChange,
}: {
  title: string; desc?: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3.5 border-b border-gray-50 last:border-0">
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-gray-900 leading-snug">{title}</p>
        {desc && <p className="text-[12px] text-gray-400 mt-0.5 leading-relaxed">{desc}</p>}
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}

function SaveButton({ saved, loading = false }: { saved: boolean; loading?: boolean }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="btn-primary text-[13px] disabled:opacity-40"
    >
      {saved ? (
        <><Check className="w-3.5 h-3.5" /> Saved</>
      ) : (
        "Save changes"
      )}
    </button>
  );
}

function useSaved() {
  const [saved, setSaved] = useState(false);
  const trigger = () => { setSaved(true); setTimeout(() => setSaved(false), 2500); };
  return [saved, trigger] as const;
}

/* ─── Section panels ──────────────────────────────────────────────────────── */

function GeneralPanel({ user }: { user: SettingsProps["user"] }) {
  const [name, setName] = useState(user?.name || "Senior Privacy Engineer");
  const [email] = useState(user?.email || "admin@lexify.cloud");
  const [timezone, setTimezone] = useState("Europe/London");
  const [language, setLanguage] = useState("en");
  const [dateFormat, setDateFormat] = useState("DD/MM/YYYY");
  const [saved, trigger] = useSaved();

  return (
    <div className="space-y-5">
      <SettingCard>
        <CardHeader icon={User} title="Identity" desc="Your name and contact details within Lexify." />
        <CardBody>
          <div className="flex items-center gap-4 mb-6 pb-5 border-b border-gray-50">
            <div className="w-14 h-14 rounded-full bg-gray-900 text-white flex items-center justify-center font-bold text-lg shrink-0">
              {(user?.name || "U").split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()}
            </div>
            <div>
              <p className="font-semibold text-[14px] text-gray-900">{user?.name || "User"}</p>
              <p className="text-[12px] text-gray-400 mt-0.5">{user?.email}</p>
              <span className="inline-flex items-center gap-1 mt-1.5 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Active session
              </span>
            </div>
          </div>
          <form
            onSubmit={(e) => { e.preventDefault(); trigger(); }}
            id="general-form"
            className="grid grid-cols-1 sm:grid-cols-2 gap-4"
          >
            <div>
              <Label>Display name</Label>
              <Input value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div>
              <Label>Email address</Label>
              <Input type="email" value={email} disabled />
            </div>
          </form>
        </CardBody>
        <CardFooter>
          <p className="text-[12px] text-gray-400">Changes apply immediately to your session.</p>
          {saved
            ? <span className="text-emerald-700 text-[13px] font-medium flex items-center gap-1.5"><CheckCircle className="w-4 h-4" /> Saved</span>
            : <button type="submit" form="general-form" className="btn-primary text-[13px]">Save changes</button>
          }
        </CardFooter>
      </SettingCard>

      <SettingCard>
        <CardHeader icon={Globe} title="Locale & Display" desc="Timezone, language and date format preferences." />
        <CardBody className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <Label>Timezone</Label>
            <Select value={timezone} onChange={e => setTimezone(e.target.value)}>
              <option value="Europe/London">UTC+0 London</option>
              <option value="America/New_York">UTC-5 New York</option>
              <option value="America/Los_Angeles">UTC-8 Los Angeles</option>
              <option value="Asia/Kolkata">UTC+5:30 Mumbai</option>
              <option value="Europe/Berlin">UTC+1 Berlin</option>
              <option value="Asia/Tokyo">UTC+9 Tokyo</option>
            </Select>
          </div>
          <div>
            <Label>Language</Label>
            <Select value={language} onChange={e => setLanguage(e.target.value)}>
              <option value="en">English</option>
              <option value="de">Deutsch</option>
              <option value="fr">Français</option>
              <option value="es">Español</option>
            </Select>
          </div>
          <div>
            <Label>Date format</Label>
            <Select value={dateFormat} onChange={e => setDateFormat(e.target.value)}>
              <option value="DD/MM/YYYY">DD/MM/YYYY</option>
              <option value="MM/DD/YYYY">MM/DD/YYYY</option>
              <option value="YYYY-MM-DD">YYYY-MM-DD</option>
            </Select>
          </div>
        </CardBody>
      </SettingCard>
    </div>
  );
}

function PrivacyPanel() {
  const [jurisdiction, setJurisdiction] = useState<string>("ALL");
  const [dataRetention, setDataRetention] = useState("90");
  const [anonymise, setAnonymise] = useState(false);
  const [thirdPartyShare, setThirdPartyShare] = useState(false);
  const [auditLog, setAuditLog] = useState(true);
  const [continuousScanning, setContinuousScanning] = useState(true);
  const [saved, trigger] = useSaved();

  return (
    <div className="space-y-5">
      <SettingCard>
        <CardHeader icon={Shield} title="Regulatory Scope" desc="Select the privacy regulations that govern your compliance workflow." />
        <CardBody className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>Target regulation</Label>
            <Select value={jurisdiction} onChange={e => setJurisdiction(e.target.value)}>
              <option value="ALL">Global Standard (GDPR + CCPA + DPDP)</option>
              <option value="GDPR">GDPR — European Union</option>
              <option value="CCPA">CCPA — California</option>
              <option value="DPDP">DPDP — India</option>
              <option value="PIPEDA">PIPEDA — Canada</option>
              <option value="LGPD">LGPD — Brazil</option>
            </Select>
          </div>
          <div>
            <Label>Data retention (days)</Label>
            <Select value={dataRetention} onChange={e => setDataRetention(e.target.value)}>
              <option value="30">30 days</option>
              <option value="60">60 days</option>
              <option value="90">90 days</option>
              <option value="180">180 days</option>
              <option value="365">1 year</option>
              <option value="0">Indefinite</option>
            </Select>
          </div>
        </CardBody>
        <CardFooter>
          <p className="text-[12px] text-gray-400">Affects all AI analysis and scan results.</p>
          {saved
            ? <span className="text-emerald-700 text-[13px] font-medium flex items-center gap-1.5"><CheckCircle className="w-4 h-4" /> Saved</span>
            : <button onClick={trigger} className="btn-primary text-[13px]">Save changes</button>
          }
        </CardFooter>
      </SettingCard>

      <SettingCard>
        <CardHeader icon={Eye} title="Data Handling" desc="Control how Lexify processes and shares your workspace data." />
        <CardBody>
          <ToggleRow title="Anonymise document metadata" desc="Strip author names, timestamps and file paths before AI processing." checked={anonymise} onChange={setAnonymise} />
          <ToggleRow title="Third-party data sharing" desc="Allow anonymised usage data to improve Lexify AI models." checked={thirdPartyShare} onChange={setThirdPartyShare} />
          <ToggleRow title="Continuous background scanning" desc="Automate scraping checks every 24 hours to generate passive compliance logs." checked={continuousScanning} onChange={setContinuousScanning} />
          <ToggleRow title="Audit event log" desc="Maintain a full log of all actions taken within this workspace." checked={auditLog} onChange={setAuditLog} />
        </CardBody>
      </SettingCard>
    </div>
  );
}

function SecurityPanel() {
  const [showKey, setShowKey] = useState(false);
  const [mfa, setMfa] = useState(false);
  const [sessionTimeout, setSessionTimeout] = useState("480");
  const [apiKeyRevealConfirm, setApiKeyRevealConfirm] = useState(false);

  const maskedKey = "sk_live_••••••••••••••••••••••••••••••••";
  const realKey   = "sk_live_7FCA8E93B1D2A45C9F3E06D28174BCAE";

  const sessions = [
    { device: "Chrome · macOS",  location: "London, GB",     time: "Now",       current: true  },
    { device: "Safari · iPhone", location: "London, GB",     time: "2h ago",    current: false },
    { device: "Chrome · Windows",location: "New York, US",   time: "3 days ago",current: false },
  ];

  return (
    <div className="space-y-5">
      <SettingCard>
        <CardHeader icon={Lock} title="Authentication" desc="Password, MFA and session management." />
        <CardBody className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Current password</Label>
              <Input type="password" placeholder="••••••••••" />
            </div>
            <div>
              <Label>New password</Label>
              <Input type="password" placeholder="Minimum 12 characters" />
            </div>
          </div>
          <ToggleRow
            title="Two-factor authentication"
            desc="Require an authenticator app code on every sign-in."
            checked={mfa}
            onChange={setMfa}
          />
          <div>
            <Label>Session timeout</Label>
            <Select value={sessionTimeout} onChange={e => setSessionTimeout(e.target.value)} className="max-w-xs">
              <option value="60">1 hour</option>
              <option value="240">4 hours</option>
              <option value="480">8 hours</option>
              <option value="1440">24 hours</option>
              <option value="0">Never</option>
            </Select>
          </div>
        </CardBody>
        <CardFooter>
          <p className="text-[12px] text-gray-400">Strong passwords are at least 12 characters.</p>
          <button className="btn-primary text-[13px]">Update password</button>
        </CardFooter>
      </SettingCard>

      <SettingCard>
        <CardHeader icon={Key} title="API Credentials" desc="Secret key used for programmatic access to the Lexify API." />
        <CardBody>
          <div className="flex items-center gap-2 mb-4">
            <div className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 font-mono text-[12px] text-gray-700 truncate">
              {showKey && apiKeyRevealConfirm ? realKey : maskedKey}
            </div>
            <button
              type="button"
              onClick={() => { setApiKeyRevealConfirm(true); setShowKey(v => !v); }}
              className="btn-secondary text-[12px] shrink-0"
            >
              {showKey && apiKeyRevealConfirm ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              {showKey && apiKeyRevealConfirm ? "Hide" : "Reveal"}
            </button>
            <button type="button" className="btn-secondary text-[12px] shrink-0">
              <RefreshCw className="w-3.5 h-3.5" /> Rotate
            </button>
          </div>
          <p className="text-[12px] text-gray-400 leading-relaxed">
            Never share your secret key. Rotating generates a new key and immediately invalidates the old one.
          </p>
        </CardBody>
      </SettingCard>

      <SettingCard>
        <CardHeader icon={Activity} title="Active Sessions" desc="Devices and locations currently signed in to your account." />
        <div className="divide-y divide-gray-50">
          {sessions.map((s, i) => (
            <div key={i} className="px-6 py-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0">
                  <Smartphone className="w-4 h-4 text-gray-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-gray-900 truncate">{s.device}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">{s.location} · {s.time}</p>
                </div>
              </div>
              {s.current
                ? <span className="badge badge-success shrink-0">Current</span>
                : <button className="btn-secondary text-[12px] shrink-0 text-red-500 hover:bg-red-50 hover:border-red-200 hover:text-red-600">Revoke</button>
              }
            </div>
          ))}
        </div>
      </SettingCard>
    </div>
  );
}

function AIPanel() {
  const [model, setModel] = useState("openai/gpt-4o");
  const [temperature, setTemperature] = useState("0.3");
  const [ragEnabled, setRagEnabled] = useState(true);
  const [streamingEnabled, setStreamingEnabled] = useState(true);
  const [citationsEnabled, setCitationsEnabled] = useState(true);
  const [safetyFilters, setSafetyFilters] = useState(true);
  const [contextWindow, setContextWindow] = useState("128k");
  const [saved, trigger] = useSaved();

  const models = [
    { value: "openai/gpt-4o",          label: "GPT-4o",              badge: "Recommended" },
    { value: "openai/gpt-4o-mini",      label: "GPT-4o Mini",         badge: "Fast" },
    { value: "anthropic/claude-3-5-sonnet", label: "Claude 3.5 Sonnet", badge: "High quality" },
    { value: "anthropic/claude-3-haiku",label: "Claude 3 Haiku",      badge: "Low cost" },
    { value: "google/gemini-pro-1.5",   label: "Gemini Pro 1.5",      badge: "" },
    { value: "meta-llama/llama-3.1-70b",label: "Llama 3.1 70B",      badge: "Open source" },
  ];

  return (
    <div className="space-y-5">
      <SettingCard>
        <CardHeader icon={Sparkles} title="Model Configuration" desc="Choose which LLM powers Lexify's analysis, drafting and review agents." />
        <CardBody className="space-y-4">
          <div>
            <Label>Primary model</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
              {models.map(m => (
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
          {saved
            ? <span className="text-emerald-700 text-[13px] font-medium flex items-center gap-1.5"><CheckCircle className="w-4 h-4" />Saved</span>
            : <button onClick={trigger} className="btn-primary text-[13px]">Save changes</button>
          }
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

function NotificationsPanel() {
  const [emailDigest, setEmailDigest]       = useState(true);
  const [scanAlerts, setScanAlerts]         = useState(true);
  const [riskAlerts, setRiskAlerts]         = useState(true);
  const [signerActivity, setSignerActivity] = useState(false);
  const [systemAlerts, setSystemAlerts]     = useState(true);
  const [alertFreq, setAlertFreq]           = useState("immediate");
  const [webhookUrl, setWebhookUrl]         = useState("");
  const [webhookSaved, triggerWebhook]      = useSaved();

  return (
    <div className="space-y-5">
      <SettingCard>
        <CardHeader icon={Mail} title="Email Notifications" desc="Choose which events trigger email updates to your inbox." />
        <CardBody>
          <div className="mb-4">
            <Label>Alert frequency</Label>
            <Select value={alertFreq} onChange={e => setAlertFreq(e.target.value)} className="max-w-xs">
              <option value="immediate">Immediate — send on every event</option>
              <option value="daily">Daily digest — 08:00 local time</option>
              <option value="weekly">Weekly summary — Mondays</option>
            </Select>
          </div>
          <ToggleRow title="Email digest" desc="Receive a periodic summary of workspace activity." checked={emailDigest} onChange={setEmailDigest} />
          <ToggleRow title="Cookie scan alerts" desc="Notify when a scan detects new non-compliant trackers." checked={scanAlerts} onChange={setScanAlerts} />
          <ToggleRow title="High-risk clause alerts" desc="Alert when an AI analysis flags a critical legal risk." checked={riskAlerts} onChange={setRiskAlerts} />
          <ToggleRow title="Signer activity" desc="Notify when a signatory views or signs a document." checked={signerActivity} onChange={setSignerActivity} />
          <ToggleRow title="System & maintenance alerts" desc="Platform status updates, downtime notices." checked={systemAlerts} onChange={setSystemAlerts} />
        </CardBody>
      </SettingCard>

      <SettingCard>
        <CardHeader icon={Webhook} title="Webhook" desc="POST a JSON payload to your endpoint on each Lexify event." />
        <CardBody className="space-y-4">
          <div>
            <Label>Endpoint URL</Label>
            <Input
              type="url"
              placeholder="https://your-service.com/webhooks/lexify"
              value={webhookUrl}
              onChange={e => setWebhookUrl(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {["scan.complete","risk.detected","document.signed","redline.added"].map(ev => (
              <span key={ev} className="badge badge-neutral font-mono text-[11px]">{ev}</span>
            ))}
          </div>
          <p className="text-[12px] text-gray-400">Events above will be delivered as signed HMAC-SHA256 POST requests.</p>
        </CardBody>
        <CardFooter>
          <button className="btn-secondary text-[13px]">Send test payload</button>
          {webhookSaved
            ? <span className="text-emerald-700 text-[13px] font-medium flex items-center gap-1.5"><CheckCircle className="w-4 h-4" />Saved</span>
            : <button onClick={triggerWebhook} className="btn-primary text-[13px]">Save endpoint</button>
          }
        </CardFooter>
      </SettingCard>
    </div>
  );
}

function WorkspacePanel() {
  const [orgName, setOrgName]   = useState("Lexify Enterprise");
  const [orgSlug, setOrgSlug]   = useState("lexify-enterprise");
  const [saved, trigger]        = useSaved();

  const members = [
    { name: "Sarah Chen",    email: "s.chen@company.com",   role: "Owner",  avatar: "SC" },
    { name: "Alex Rivera",   email: "a.rivera@company.com", role: "Admin",  avatar: "AR" },
    { name: "James Okafor",  email: "j.okafor@company.com", role: "Member", avatar: "JO" },
    { name: "Priya Nair",    email: "p.nair@company.com",   role: "Member", avatar: "PN" },
  ];

  const roleColor: Record<string, string> = {
    Owner:  "badge-blue",
    Admin:  "badge-warning",
    Member: "badge-neutral",
  };

  const integrations = [
    { name: "Slack",        icon: "🔷", connected: true,  desc: "Post alerts to channels" },
    { name: "Jira",         icon: "🎯", connected: false, desc: "Create issues from risks" },
    { name: "Microsoft Teams", icon: "🟣", connected: false, desc: "Team notifications" },
    { name: "Google Drive", icon: "📁", connected: true,  desc: "Import/export documents" },
  ];

  return (
    <div className="space-y-5">
      <SettingCard>
        <CardHeader icon={Building2} title="Organisation" desc="Workspace identity and URL settings." />
        <CardBody className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>Organisation name</Label>
            <Input value={orgName} onChange={e => setOrgName(e.target.value)} />
          </div>
          <div>
            <Label>Workspace slug</Label>
            <div className="flex items-center">
              <span className="bg-gray-100 border border-r-0 border-gray-200 rounded-l-xl px-3 py-2.5 text-[12px] text-gray-400 shrink-0">lexify.cloud/</span>
              <Input value={orgSlug} onChange={e => setOrgSlug(e.target.value)} className="rounded-l-none" />
            </div>
          </div>
        </CardBody>
        <CardFooter>
          <p className="text-[12px] text-gray-400">Slug changes affect all shared links immediately.</p>
          {saved
            ? <span className="text-emerald-700 text-[13px] font-medium flex items-center gap-1.5"><CheckCircle className="w-4 h-4" />Saved</span>
            : <button onClick={trigger} className="btn-primary text-[13px]">Save changes</button>
          }
        </CardFooter>
      </SettingCard>

      <SettingCard>
        <CardHeader icon={Users} title="Team Members" desc="People with access to this workspace." />
        <div className="divide-y divide-gray-50">
          {members.map((m, i) => (
            <div key={i} className="px-6 py-3.5 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gray-900 text-white flex items-center justify-center font-semibold text-[11px] shrink-0">{m.avatar}</div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-gray-900 truncate">{m.name}</p>
                <p className="text-[11px] text-gray-400 truncate">{m.email}</p>
              </div>
              <span className={`badge ${roleColor[m.role]} shrink-0`}>{m.role}</span>
            </div>
          ))}
        </div>
        <CardFooter>
          <p className="text-[12px] text-gray-400">4 of 10 seats used.</p>
          <button className="btn-primary text-[13px]">Invite member</button>
        </CardFooter>
      </SettingCard>

      <SettingCard>
        <CardHeader icon={CreditCard} title="Integrations" desc="Connect Lexify to your existing toolstack." />
        <div className="divide-y divide-gray-50">
          {integrations.map((int, i) => (
            <div key={i} className="px-6 py-4 flex items-center gap-3">
              <span className="text-xl w-8 flex justify-center shrink-0">{int.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-gray-900">{int.name}</p>
                <p className="text-[12px] text-gray-400">{int.desc}</p>
              </div>
              <button className={`btn-secondary text-[12px] shrink-0 ${int.connected ? "text-red-500 hover:bg-red-50 hover:border-red-200" : ""}`}>
                {int.connected ? "Disconnect" : "Connect"}
              </button>
            </div>
          ))}
        </div>
      </SettingCard>
    </div>
  );
}

function AdvancedPanel() {
  const [debugMode, setDebugMode]     = useState(false);
  const [betaFeatures, setBetaFeatures] = useState(false);
  const [verboseLogs, setVerboseLogs]   = useState(false);

  const services = [
    { name: "Cookie Scanner API",     status: "operational", latency: "42ms",  icon: Wifi },
    { name: "Legal Analysis Engine",  status: "operational", latency: "118ms", icon: Cpu },
    { name: "Document Storage",       status: "operational", latency: "28ms",  icon: HardDrive },
    { name: "AI Inference (OpenRouter)", status: "degraded", latency: "890ms", icon: Sparkles },
    { name: "Job Queue (BullMQ)",     status: "operational", latency: "15ms",  icon: Clock },
    { name: "Database (PostgreSQL)",  status: "operational", latency: "9ms",   icon: Database },
    { name: "RAG Retrieval Service",  status: "operational", latency: "63ms",  icon: Server },
    { name: "Vulnerability Scanner",  status: "maintenance", latency: "—",     icon: Shield },
  ];

  const statusConfig: Record<string, { label: string; badgeClass: string; dotClass: string }> = {
    operational: { label: "Operational", badgeClass: "bg-emerald-50 text-emerald-700", dotClass: "bg-emerald-500" },
    degraded:    { label: "Degraded",    badgeClass: "bg-amber-50  text-amber-700",   dotClass: "bg-amber-500 animate-pulse" },
    maintenance: { label: "Maintenance", badgeClass: "bg-gray-100  text-gray-500",    dotClass: "bg-gray-400" },
    outage:      { label: "Outage",      badgeClass: "bg-red-50    text-red-700",     dotClass: "bg-red-500 animate-pulse" },
  };

  const operationalCount = services.filter(s => s.status === "operational").length;
  const overallHealthy   = services.every(s => s.status === "operational" || s.status === "maintenance");

  return (
    <div className="space-y-5">
      {/* Workspace Health */}
      <SettingCard>
        <CardHeader icon={Activity} title="Workspace Health" desc="Real-time status of all Lexify platform services." />
        <CardBody className="pb-2">
          {/* Summary bar */}
          <div className={`flex items-center gap-3 mb-5 px-4 py-3.5 rounded-xl border
            ${overallHealthy ? "bg-emerald-50 border-emerald-100" : "bg-amber-50 border-amber-100"}`}>
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
          <button className="btn-secondary text-[13px] flex items-center gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
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

/* ─── Root component ──────────────────────────────────────────────────────── */

export default function SettingsView({ user }: SettingsProps) {
  const [active, setActive] = useState<SettingsSection>("general");

  const current = NAV_ITEMS.find(n => n.id === active)!;

  function renderPanel() {
    switch (active) {
      case "general":       return <GeneralPanel user={user} />;
      case "privacy":       return <PrivacyPanel />;
      case "security":      return <SecurityPanel />;
      case "ai":            return <AIPanel />;
      case "notifications": return <NotificationsPanel />;
      case "workspace":     return <WorkspacePanel />;
      case "advanced":      return <AdvancedPanel />;
    }
  }

  return (
    <div className="flex-1 flex overflow-hidden bg-[#FAFAFB]">

      {/* ── Left settings nav ────────────────────────────────────────────── */}
      <aside className="w-[220px] shrink-0 border-r border-gray-200 bg-white flex flex-col overflow-y-auto scrollbar-none">
        <div className="px-5 pt-7 pb-5 border-b border-gray-100">
          <h2 className="font-bold text-[15px] text-gray-900 tracking-tight">Settings</h2>
          <p className="text-[11px] text-gray-400 mt-0.5">Workspace configuration</p>
        </div>

        <nav className="flex-1 px-2.5 py-3 space-y-0.5">
          {NAV_ITEMS.map(item => {
            const Icon = item.icon;
            const isActive = active === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActive(item.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-all duration-150 group outline-none
                  ${isActive
                    ? "bg-gray-900 text-white shadow-sm"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? "text-white" : "text-gray-400 group-hover:text-gray-600"}`} />
                <span className="text-[13px] font-medium truncate">{item.label}</span>
                {isActive && <ChevronRight className="w-3 h-3 ml-auto shrink-0 text-white/60" />}
              </button>
            );
          })}
        </nav>

        {/* Plan badge */}
        <div className="px-4 py-4 border-t border-gray-100">
          <div className="px-3 py-3 rounded-xl bg-gray-50 border border-gray-100">
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-0.5">Plan</p>
            <p className="text-[13px] font-bold text-gray-900">Enterprise</p>
            <p className="text-[11px] text-gray-400 mt-0.5">Unlimited seats · SLA 99.9%</p>
          </div>
        </div>
      </aside>

      {/* ── Right panel ──────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-8 py-8">

          {/* Panel header */}
          <div className="mb-7">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[12px] text-gray-400 font-medium">Settings</span>
              <ChevronRight className="w-3 h-3 text-gray-300" />
              <span className="text-[12px] text-gray-600 font-medium">{current.label}</span>
            </div>
            <h1 className="text-[22px] font-bold text-gray-900 tracking-tight leading-tight">{current.label}</h1>
            <p className="text-[13px] text-gray-500 mt-0.5">{current.desc}</p>
          </div>

          {/* Animated panel swap */}
          <div key={active}>
            {renderPanel()}
          </div>
        </div>
      </div>

    </div>
  );
}
