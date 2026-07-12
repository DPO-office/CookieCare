import React, { useState } from "react";
import { User, Globe, CheckCircle } from "lucide-react";
import { SettingCard, CardHeader, CardBody, CardFooter, Label, Input, Select, SavedIndicator, useSaved } from "./SettingsPrimitives";
import { SettingsProps } from "../types";

export default function GeneralPanel({ user }: SettingsProps) {
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
          <form onSubmit={(e) => { e.preventDefault(); trigger(); }} id="general-form" className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><Label>Display name</Label><Input value={name} onChange={e => setName(e.target.value)} /></div>
            <div><Label>Email address</Label><Input type="email" value={email} disabled /></div>
          </form>
        </CardBody>
        <CardFooter>
          <p className="text-[12px] text-gray-400">Changes apply immediately to your session.</p>
          {saved
            ? <SavedIndicator saved={saved} />
            : <button type="submit" form="general-form" className="btn-primary text-[13px]">Save changes</button>}
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
