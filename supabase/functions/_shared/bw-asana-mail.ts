import { formatFccPhone } from "./fcc-asana-mail.ts";

function plainPart(value: string): string {
  return String(value || "").replace(/[:：]/g, " ").replace(/\s+/g, " ").trim();
}

export function bwSubjectTopic(subject: string): string {
  const text = String(subject || "").trim();
  const cut = text.search(/[:：]/);
  return plainPart(cut >= 0 ? text.slice(0, cut) : text);
}

export function formatBwInquiryTitle(input: {
  subject: string;
  name?: string;
  phone?: string;
  address?: string;
}): string {
  const topic = bwSubjectTopic(input.subject);
  const phone = plainPart(input.phone || "");
  const parts = [
    plainPart(input.name || ""),
    phone ? formatFccPhone(phone) : "",
    plainPart(input.address || ""),
  ].map(plainPart).filter(Boolean);
  if (!topic) return parts.join(" ");
  if (parts.length === 0) return topic;
  return `${topic} - ${parts.join(" ")}`;
}

export function organizeBwNotes(body: string): string {
  const fields: Array<{ label: string; value: string }> = [];
  for (const line of String(body || "").split(/\r?\n/)) {
    const trimmed = line.trim();
    const colon = trimmed.match(/^(.*?)[:：]\s*(.*)$/);
    if (!colon || !colon[1].trim()) continue;
    const label = colon[1].replace(/\*+/g, "").replace(/\s+/g, " ").trim();
    const value = colon[2].replace(/^(?:[:：]\s*)+/, "").replace(/\s+/g, " ").trim();
    if (!label || !value) continue;
    fields.push({ label, value });
  }
  return fields.map((field) => `${field.label}: ${field.value}`).join("\n");
}
