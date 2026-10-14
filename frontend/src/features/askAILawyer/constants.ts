import { AlertCircle, ScrollText, Globe, Brain } from "lucide-react";

export const QUICK_PROMPTS = [
  {
    label: "GDPR breach notification",
    description: "Articles 33 and 34 duties, the 72-hour deadline, and when data subjects must be told.",
    icon: AlertCircle,
    prompt:
      "Research the GDPR personal data breach notification duties for an EU/EEA controller. Cover Articles 33 and 34, including the 72-hour deadline to notify the competent supervisory authority, when a processor must notify the controller without undue delay, the threshold for notifying data subjects (risk versus high risk), and the information a notification must contain. Explain how to document the breach under Article 33(5), how encryption or pseudonymisation can affect the risk assessment, and how the one-stop-shop and lead supervisory authority work in a cross-border breach. Ground the analysis in EDPB Guidelines 9/2022 on personal data breach notification and related EDPB guidance.",
  },
  {
    label: "EU AI Act compliance",
    description: "Risk classification and provider duties for high-risk AI systems under Regulation (EU) 2024/1689.",
    icon: Brain,
    prompt:
      "Research EU AI Act compliance for a provider that develops an AI system and places it on the EU market, where the system processes personal data of people in the EEA. Explain how to classify the system under Regulation (EU) 2024/1689 as prohibited, high-risk, limited-risk, or minimal-risk, with reference to Article 5, Article 6, and Annex III. For a high-risk system, set out the provider obligations on risk management, data governance, technical documentation, record-keeping, transparency, human oversight, accuracy, robustness, and cybersecurity, and the conformity-assessment and CE-marking steps before placing it on the market. Also explain how those duties interact with the GDPR where the system involves personal data, including roles of controller and processor, and note the phased application dates that are already in force versus those still to come.",
  },
  {
    label: "Cross-border transfers",
    description: "Chapter V transfer tools, SCCs, and transfer impact assessments after Schrems II.",
    icon: Globe,
    prompt:
      "Research the GDPR rules on transferring personal data from the EEA to a third country that does not benefit from a European Commission adequacy decision. Explain Chapter V, when the Standard Contractual Clauses adopted by Commission Implementing Decision (EU) 2021/914 are an appropriate safeguard, and how to choose among the controller-to-controller, controller-to-processor, processor-to-processor, and processor-to-controller modules. Cover the transfer impact assessment expected after Schrems II (CJEU, C-311/18) and EDPB Recommendations 01/2020, including when supplementary measures are required, how onward transfers should be restricted, and what documentation an EEA exporter should keep. Distinguish this from an adequacy-based transfer and from a transfer that stays inside the EEA.",
  },
  {
    label: "Article 28 DPA terms",
    description: "Mandatory processor contract terms under GDPR Article 28 for an EU/EEA engagement.",
    icon: ScrollText,
    prompt:
      "Research the mandatory content of a data processing agreement under GDPR Article 28 between an EU/EEA controller and a processor established in the EEA. Cover processing only on documented instructions, confidentiality of persons authorised to process, security measures under Article 32, rules on engaging sub-processors (prior authorisation and flow-down of the same obligations), assistance with data-subject requests and with Articles 33 and 34 breach duties, deletion or return of personal data at the end of the service, and the controller's audit and information rights. Explain the consequences if the processor determines purposes or essential means and thereby acts as a controller, and note relevant EDPB guidance on the concepts of controller and processor. Flag clauses that are commonly missing or too vague to satisfy Article 28(3).",
  },
] as const;
