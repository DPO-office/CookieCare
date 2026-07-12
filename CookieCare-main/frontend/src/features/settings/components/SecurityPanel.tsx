import React, { useState } from "react";
import { Lock, Key, Activity, Eye, EyeOff, RefreshCw, Smartphone } from "lucide-react";
import { SettingCard, CardHeader, CardBody, CardFooter, Label, Input, Select, ToggleRow } from "./SettingsPrimitives";

export default function SecurityPanel() {
  const [showKey, setShowKey] = useState(false);
  const [mfa, setMfa] = useState(false);
  const [sessionTimeout, setSessionTimeout] = useState("480");
  const [apiKeyRevealConfirm, setApiKeyRevealConfirm] = useState(false);

  const maskedKey = "";
  const realKey   = "";

  const sessions = [
    { device: "Chrome · macOS",   location: "London, GB",     time: "Now",        current: true  },
    { device: "Safari · iPhone",  location: "London, GB",     time: "2h ago",     current: false },
    { device: "Chrome · Windows", location: "New York, US",   time: "3 days ago", current: false },
  ];

  return (
    <div className="space-y-5">
      <SettingCard>
        <CardHeader icon={Lock} title="Authentication" desc="Password, MFA and session management." />
        <CardBody className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><Label>Current password</Label><Input type="password" placeholder="••••••••••" /></div>
            <div><Label>New password</Label><Input type="password" placeholder="Minimum 12 characters" /></div>
          </div>
          <ToggleRow title="Two-factor authentication" desc="Require an authenticator app code on every sign-in." checked={mfa} onChange={setMfa} />
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
            <button type="button" onClick={() => { setApiKeyRevealConfirm(true); setShowKey(v => !v); }} className="btn-secondary text-[12px] shrink-0">
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
                : <button className="btn-secondary text-[12px] shrink-0 text-red-500 hover:bg-red-50 hover:border-red-200 hover:text-red-600">Revoke</button>}
            </div>
          ))}
        </div>
      </SettingCard>
    </div>
  );
}
