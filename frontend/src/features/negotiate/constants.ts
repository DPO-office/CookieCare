import React from "react";
import { ShieldAlert, AlertTriangle, ShieldCheck } from "lucide-react";

export const RISK_CONFIG = {
  RED: {
    label: "High Risk",
    bg: "bg-red-50",
    border: "border-red-200",
    text: "text-red-700",
    clauseHighlight: "bg-red-50 border-red-200 hover:bg-red-100",
  },
  YELLOW: {
    label: "Medium Risk",
    bg: "bg-amber-50",
    border: "border-amber-200",
    text: "text-amber-700",
    clauseHighlight: "bg-amber-50 border-amber-200 hover:bg-amber-100",
  },
  GREEN: {
    label: "Low Risk",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    text: "text-emerald-700",
    clauseHighlight: "bg-emerald-50 border-emerald-200 hover:bg-emerald-100",
  },
} as const;
