export type ReportingGuidanceStage = "compose" | "check" | "repair";

export interface ReportingGuidancePackage {
  id: string;
  version: string;
  instructions: Record<ReportingGuidanceStage, string>;
}

export interface ReportingExample {
  id: string;
  version: string;
  signals: RegExp[];
  annotation: string;
}
