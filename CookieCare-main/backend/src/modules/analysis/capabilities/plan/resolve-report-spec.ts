import type { EvidencePackage } from "../../models/evidence-package.js";
import type {
  ReportDepth,
  ReportSectionId,
  ReportSpec,
  ReportType,
} from "../../models/intent.js";
import { deriveSections } from "../../models/intent.js";
import type { IntentClassification } from "../../models/intent.js";
import { normalizeReportSections } from "../../prompts/report-sections.js";
import { deriveReportOutline } from "./derive-report-outline.js";

function sortSections(sections: ReportSectionId[]): ReportSectionId[] {
  // Expand legacy combined sections and force Conclusion last for every skill/ask.
  return normalizeReportSections(sections);
}

export function mergeAuthoredReportSections(args: {
  reportType: ReportType;
  depth: ReportDepth;
  packages: EvidencePackage[];
  operation?: import("../../models/intent.js").OperationAxis;
}): {
  reportType: ReportType;
  sections: ReportSectionId[];
  outlineExtras: NonNullable<EvidencePackage["report"]>["outlineExtras"];
} {
  const { reportType, depth, packages } = args;
  let mergedType = reportType;
  const sectionSet = new Set<ReportSectionId>();
  const outlineExtras: NonNullable<EvidencePackage["report"]>["outlineExtras"] =
    [];

  for (const pkg of packages) {
    const report = pkg.report;
    if (!report) continue;
    if (report.reportType) mergedType = report.reportType;
    const fromDepth = report.sectionsByDepth?.[depth];
    const fromPkg = fromDepth ?? report.sections ?? [];
    for (const section of fromPkg) sectionSet.add(section);
    if (report.outlineExtras?.length) {
      outlineExtras.push(...report.outlineExtras);
    }
  }

  const sections =
    sectionSet.size > 0
      ? sortSections([...sectionSet])
      : deriveSections(mergedType, depth, args.operation);

  return { reportType: mergedType, sections, outlineExtras: outlineExtras ?? [] };
}

export function resolveReportSpecFromPackages(args: {
  intent: IntentClassification;
  instruction: string;
  packages: EvidencePackage[];
  fallbackReportType: ReportType;
}): Omit<ReportSpec, "outline"> & { outlineExtras: NonNullable<EvidencePackage["report"]>["outlineExtras"] } {
  const depth = args.intent.depth ?? "standard";
  const reportType = args.intent.reportType ?? args.fallbackReportType;
  const merged = mergeAuthoredReportSections({
    reportType,
    depth,
    packages: args.packages,
    operation: args.intent.operation,
  });
  return {
    reportType: merged.reportType,
    depth,
    sections: merged.sections,
    outlineExtras: merged.outlineExtras,
  };
}

export function buildFinalReportSpec(args: {
  intent: IntentClassification;
  reportType: ReportType;
  depth: ReportDepth;
  sections: ReportSectionId[];
  outlineExtras: NonNullable<EvidencePackage["report"]>["outlineExtras"];
  enableRefine?: boolean;
  instruction: string;
}): ReportSpec {
  const outline = deriveReportOutline(
    args.intent,
    args.reportType,
    args.depth,
    args.sections,
    args.outlineExtras ?? []
  );
  return {
    reportType: args.reportType,
    depth: args.depth,
    sections: args.sections,
    outline,
  };
}

export function reportTypeToOutputForm(
  reportType: ReportType
): import("../../models/intent.js").OutputFormAxis {
  switch (reportType) {
    case "extraction_table":
      return "table";
    case "qa_answer":
      return "qa_thread";
    case "rights_matrix":
      return "memo";
    default:
      return "memo";
  }
}
