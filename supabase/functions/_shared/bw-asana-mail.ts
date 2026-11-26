import { formatFccPhone, inquiryAlreadyOpened, normalizeFccBody, sameInquiryContent } from "./fcc-asana-mail.ts";

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

function readBwMobile(body: string): string {
  const labeled = readBwField(body, [
    "聯絡電話",
    "手提電話",
    "電話",
    "手機",
    "Phone",
    "(Whatsapp/SMS)",
    "(WhatsApp/SMS)",
    "Whatsapp/SMS",
    "WhatsApp",
  ]);
  if (labeled) return labeled;
  for (const line of body.split(/\r?\n/)) {
    const match = line.trim().match(/^(.*)[:：]\s*(.+)$/);
    if (!match) continue;
    const label = match[1].replace(/\*+/g, "").trim();
    if (!/whatsapp|\bsms\b/i.test(label)) continue;
    const value = match[2].replace(/^(?:[:：]\s*)+/, "").trim();
    if (value) return value;
  }
  return "";
}

function readBwLandline(body: string): string {
  return readBwField(body, ["固網電話"]);
}

function readBwOrganization(body: string): string {
  return readBwField(body, ["機構名稱", "機構名", "公司名稱", "公司", "學校名稱"]);
}

function organizationFromSubject(subject: string): string {
  const cut = String(subject || "").search(/[:：]/);
  if (cut < 0) return "";
  const parts = subject.slice(cut + 1).split(/\s+-\s+/).map((part) => part.replace(/\*+$/g, "").trim()).filter(Boolean);
  const org = parts.find((part) => !/\d{8}/.test(part) && !/^姓名$/.test(part) && part.length > 1);
  return org || "";
}

function phoneFromSubject(subject: string): string {
  const cut = String(subject || "").search(/[:：]/);
  const tail = cut >= 0 ? subject.slice(cut + 1) : "";
  const labeled = tail.match(/(?:tel|phone|電話|手提)\s*[:：]?\s*(\+?\d[\d\s-]{6,}\d)/i);
  if (labeled) return labeled[1];
  const bare = tail.match(/(?:^|[\s,，])(\d{8})(?=$|[\s,，-])/);
  return bare?.[1] || "";
}

export function stableBwNotes(notes: string): string {
  return sameInquiryContent(notes)
    .replace(/https?:\/\/files\.emailmeform\.com\/\d+\/[A-Za-z0-9]+\//gi, "https://files.emailmeform.com/file/")
    .trim();
}

export function bwInquiryAlreadyOpened(taskName: string, taskNotes: string, title: string, notes: string): boolean {
  const expected = stableBwNotes(notes);
  const existing = stableBwNotes(taskNotes);
  if (expected && existing && expected === existing) return true;
  return inquiryAlreadyOpened(taskName, taskNotes, title, notes);
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
  const mobile = readBwMobile(source) || phoneFromSubject(subject);
  const landline = readBwLandline(source);
  const organization = readBwOrganization(source) || organizationFromSubject(subject);
  const address = readBwField(source, ["送貨地址", "工程地點", "工程項目地區", "地址", "地區"]);
  return {
    title: formatBwInquiryTitle({ subject, name, phone: mobile, landline, organization, address }),
    notes: organizeBwNotes(source),
    name,
    phone: mobile || landline,
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

function titlePhones(phone: string, landline: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of [phone, landline]) {
    const formatted = formatFccPhone(plainPart(value));
    const digits = formatted.replace(/\D/g, "");
    if (!digits || seen.has(digits)) continue;
    seen.add(digits);
    out.push(formatted);
  }
  return out;
}

export function formatBwInquiryTitle(input: {
  subject: string;
  name?: string;
  phone?: string;
  landline?: string;
  organization?: string;
  address?: string;
}): string {
  const topic = bwSubjectTopic(input.subject);
  const name = plainPart(input.name || "");
  const organization = plainPart(input.organization || "");
  const address = plainPart(input.address || "");
  const orgText = organization && organization !== name && organization !== address && !topic.includes(organization) ? organization : "";
  const parts = [
    name,
    ...titlePhones(input.phone || "", input.landline || ""),
    orgText,
    address,
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
