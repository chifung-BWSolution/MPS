import { formatFccPhone, normalizeFccBody } from "./fcc-asana-mail.ts";

export type BwRouteRule = {
  keyword: string;
  assigneeEmail: string;
  projectGid: string;
  enabled: boolean;
};

function escapeReg(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function readBwField(body: string, labels: string[]): string {
  const lines = body.split(/\r?\n/);
  for (const label of labels) {
    const pattern = new RegExp(`^${escapeReg(label)}\\s*(?:[（(][^）)]*[）)])?\\s*\\**\\s*[:：]\\s*(.*)$`);
    for (let i = 0; i < lines.length; i += 1) {
      const match = lines[i].trim().match(pattern);
      if (!match) continue;
      const value = match[1].replace(/^(?:[:：]\s*)+/, "").trim();
      if (value) return value;
      const next = lines.slice(i + 1).map((item) => item.trim().replace(/^(?:[:：]\s*)+/, "")).find(Boolean);
      if (next) return next;
    }
  }
  return "";
}

export function bwSkipReason(subject: string, skipSubjects: string[]): string | null {
  const text = String(subject || "").trim();
  if (/^(re|fw|fwd)\s*[:：]/i.test(text) || /^回覆[:：]/.test(text) || /^轉寄[:：]/.test(text)) {
    return "回覆信，不開 task";
  }
  if (/payment disabled/i.test(text)) return "EmailMeForm 系統通知，不開 task";
  if (/FCC\s*到會|FCP活動|開店預約|開店說明會|餐廳開店/.test(text)) return "這是 FC 查詢，不在 BW 開 task";
  const hit = skipSubjects.map((item) => item.trim()).filter(Boolean).find((item) => text.toLowerCase().includes(item.toLowerCase()));
  if (hit) return `主旨包含略過字句「${hit}」，不開 task`;
  return null;
}

export function matchBwRoute(
  subject: string,
  routes: BwRouteRule[],
  mode: "phrase" | "words",
  minWords: number,
): BwRouteRule | null {
  const text = String(subject || "");
  const hits = routes.filter((route) => {
    const keyword = route.keyword.trim();
    if (!route.enabled || !keyword) return false;
    if (mode === "words") {
      const tokens = keyword.split(/[^\p{L}\p{N}&]+/u).filter(Boolean);
      const hitCount = tokens.filter((token) => text.includes(token)).length;
      return hitCount >= Math.max(1, minWords);
    }
    return text.includes(keyword);
  });
  hits.sort((a, b) => {
    const lengthGap = b.keyword.trim().length - a.keyword.trim().length;
    if (lengthGap !== 0) return lengthGap;
    return text.indexOf(a.keyword.trim()) - text.indexOf(b.keyword.trim());
  });
  return hits[0] || null;
}

export function parseBwInquiry(body: string, subject: string): {
  title: string;
  notes: string;
  name: string;
  phone: string;
  address: string;
} {
  const source = normalizeFccBody(body);
  const name = readBwField(source, ["姓名", "客人姓名"]);
  const phone = readBwField(source, ["聯絡電話", "手提電話", "電話", "手機", "Phone"]);
  const address = readBwField(source, ["送貨地址", "工程地點", "工程項目地區", "地址", "地區"]);
  return {
    title: formatBwInquiryTitle({ subject, name, phone, address }),
    notes: organizeBwNotes(source),
    name,
    phone,
    address,
  };
}

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
