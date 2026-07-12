import React, { useState } from "react";
import { Mail, Webhook } from "lucide-react";
import { SettingCard, CardHeader, CardBody, CardFooter, Label, Select, Input, ToggleRow, SavedIndicator, useSaved } from "./SettingsPrimitives";

export default function NotificationsPanel() {
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
            <Input type="url" placeholder="https://your-service.com/webhooks/lexify" value={webhookUrl} onChange={e => setWebhookUrl(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-2">
            {["scan.complete", "risk.detected", "document.signed", "redline.added"].map(ev => (
              <span key={ev} className="badge badge-neutral font-mono text-[11px]">{ev}</span>
            ))}
          </div>
          <p className="text-[12px] text-gray-400">Events above will be delivered as signed HMAC-SHA256 POST requests.</p>
        </CardBody>
        <CardFooter>
          <button className="btn-secondary text-[13px]">Send test payload</button>
          {webhookSaved ? <SavedIndicator saved={webhookSaved} /> : <button onClick={triggerWebhook} className="btn-primary text-[13px]">Save endpoint</button>}
        </CardFooter>
      </SettingCard>
    </div>
  );
}
