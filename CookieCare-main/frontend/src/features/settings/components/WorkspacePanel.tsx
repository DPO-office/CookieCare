import React, { useState } from "react";
import { Building2, Users, CreditCard } from "lucide-react";
import { SettingCard, CardHeader, CardBody, CardFooter, Label, Input, SavedIndicator, useSaved } from "./SettingsPrimitives";

export default function WorkspacePanel() {
  const [orgName, setOrgName] = useState("Lexify Enterprise");
  const [orgSlug, setOrgSlug] = useState("lexify-enterprise");
  const [saved, trigger]      = useSaved();

  const members = [
    { name: "Sarah Chen",   email: "s.chen@company.com",   role: "Owner",  avatar: "SC" },
    { name: "Alex Rivera",  email: "a.rivera@company.com", role: "Admin",  avatar: "AR" },
    { name: "James Okafor", email: "j.okafor@company.com", role: "Member", avatar: "JO" },
    { name: "Priya Nair",   email: "p.nair@company.com",   role: "Member", avatar: "PN" },
  ];

  const roleColor: Record<string, string> = {
    Owner: "badge-blue", Admin: "badge-warning", Member: "badge-neutral",
  };

  const integrations = [
    { name: "Slack",           icon: "🔷", connected: true,  desc: "Post alerts to channels" },
    { name: "Jira",            icon: "🎯", connected: false, desc: "Create issues from risks" },
    { name: "Microsoft Teams", icon: "🟣", connected: false, desc: "Team notifications" },
    { name: "Google Drive",    icon: "📁", connected: true,  desc: "Import/export documents" },
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
          {saved ? <SavedIndicator saved={saved} /> : <button onClick={trigger} className="btn-primary text-[13px]">Save changes</button>}
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
        <CardHeader icon={CreditCard} title="Integrations" desc="Connect third-party services to your workspace." />
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
