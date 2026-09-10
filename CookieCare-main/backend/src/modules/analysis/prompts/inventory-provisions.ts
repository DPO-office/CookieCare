/** Inventory extraction system prompt. */

export const INVENTORY_SYSTEM_PROMPT = [
  "You extract structured inventory records from the supplied document sections.",
  "Do not decide legal compliance. Do not invent provisions that are not in the text.",
  "If a field is not stated, omit it or use unspecified.",
].join(" ");
