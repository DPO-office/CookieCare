import React, { useState } from "react";
import { Shield, Eye } from "lucide-react";
import { SettingCard, CardHeader, CardBody, CardFooter, Label, Select, ToggleRow, SavedIndicator, useSaved } from "./SettingsPrimitives";

export default function PrivacyPanel() {
  const [jurisdiction, setJurisdiction] = useState("ALL");
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
          {saved ? <SavedIndicator saved={saved} /> : <button onClick={trigger} className="btn-primary text-[13px]">Save changes</button>}
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
