import { LibraryTabId } from "./types";

export interface TabConfig {
  id: LibraryTabId;
  label: string;
  desc: string;
  placeholder: string;
  buttonWord: string;
}

export const TABS_CONFIG: TabConfig[] = [
  { id: "files",       label: "Files",        desc: "Upload and organise your documents",                         placeholder: "Search folders...",       buttonWord: "Create Folder"       },
  { id: "prompts",     label: "Prompts",      desc: "Define personalized prompt instructions for AI reviews",     placeholder: "Search AI prompts...",     buttonWord: "Create Prompt"       },
  { id: "questions",   label: "Question set", desc: "Manage pre-structured context question sets",                placeholder: "Search question sets...",  buttonWord: "Create Question Set" },
  { id: "rulebook",    label: "AI rulebook",  desc: "Configure playbook policies and compliance guidelines",      placeholder: "Search rulebooks...",      buttonWord: "Create Rule"         },
  { id: "templates",   label: "Templates",    desc: "Boilerplate structural templates of pre-approved documents", placeholder: "Search templates...",      buttonWord: "Create Template"     },
  { id: "clauses",     label: "Clauses",      desc: "Standardized contract clauses and fallback wordings",        placeholder: "Search clauses...",        buttonWord: "Create Clause"       },
  { id: "websites",    label: "Websites",     desc: "Configure authoritative websites and reference domains",     placeholder: "Search websites...",       buttonWord: "Create Website"      },
  { id: "tags",        label: "Tags",         desc: "Administrative labels and taxonomy parameters",              placeholder: "Search tags...",           buttonWord: "Create Tag"          },
  { id: "saved-drafts",label: "Saved Drafts", desc: "Drafts saved from the Draft Templates module",              placeholder: "Search drafts...",         buttonWord: ""                    },
];
