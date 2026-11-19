export type FccMailRule = {
  lunchProjectGid: string;
  cateringProjectGid: string;
  lunchTitlePrefix: string;
  cateringTitlePrefix: string;
};

export type FccParsedMail = {
  route: "lunch" | "catering";
  projectGid: string;
  title: string;
  notes: string;
  name: string;
  phone: string;
  company: string;
};

const CATERING_PATTERNS = [/正餐\s*到會/, /小食\s*到會/];
const LUNCH_PATTERNS = [/經濟飯盒/, /高級飯盒/, /下午茶餐盒/];

export function resolveFccGmailOAuthClient(): { clientId: string; clientSecret: string } {
  const clientId = (Deno.env.get("GOOGLE_GMAIL_FCC_CLIENT_ID") || "").trim();
  const clientSecret = (Deno.env.get("GOOGLE_GMAIL_FCC_CLIENT_SECRET") || "").trim();
  if (!clientId || !clientSecret) {
    throw new Error("缺少 GOOGLE_GMAIL_FCC_CLIENT_ID 或 GOOGLE_GMAIL_FCC_CLIENT_SECRET");
  }
  return { clientId, clientSecret };
}

export function formatFccPhone(raw: string): string {
  const digits = String(raw || "").replace(/\D/g, "");
  const local = digits.length === 11 && digits.startsWith("852") ? digits.slice(3) : digits;
  if (local.length === 8) return `${local.slice(0, 4)} ${local.slice(4)}`;
  if (!local) return String(raw || "").trim();
  return local.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
}

function readField(body: string, labels: string[]): string {
  const lines = body.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    for (const label of labels) {
      const match = line.match(new RegExp(`^${label}\\s*\\**\\s*[:：]\\s*(.*)$`));
      if (!match) continue;
      if (match[1].trim()) return match[1].trim();
      const next = lines.slice(i + 1).map((item) => item.trim()).find(Boolean);
      return next || "";
    }
  }
  return "";
}

export function extractFccReferrer(body: string): string {
  const labeled = body.match(/(?:referrer|來源網址|來源)\s*[:：]\s*(https?:\/\/\S+)/i);
  if (labeled) return labeled[1].replace(/[),.;]+$/, "");
  const urls = body.match(/https?:\/\/\S+/g) || [];
  return (urls[urls.length - 1] || "").replace(/[),.;]+$/, "");
}

export function htmlToText(html: string): string {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<\/t[dh]>\s*<t[dh][^>]*>/gi, ": ")
    .replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>[\s\S]*?<\/a>/gi, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, digits) => String.fromCodePoint(Number(digits)))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function normalizeFccBody(body: string): string {
  const source = String(body || "");
  if (/<[a-z!/][^>]*>/i.test(source)) return htmlToText(source);
  return source;
}

function cleanFccLabel(label: string): string {
  const cleaned = label
    .replace(/\*+/g, "")
    .replace(/[（(]\s*可選多於一項\s*[）)]/g, "")
    .replace(/[（(]\s*方便出報價\s*[）)]/g, "")
    .replace(/[（(][^）)]*可免地面交收運費[^）)]*[）)]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (/^referrer(?:\s*url)?$/i.test(cleaned) || cleaned === "來源" || cleaned === "來源網址") return "Referrer URL";
  return cleaned;
}

export function organizeFccNotes(body: string): string {
  const cut = body.search(/了解條款及政策/);
  const main = cut >= 0 ? body.slice(0, cut) : body;
  const lines = main.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const fields: Array<{ label: string; value: string }> = [];
  let pending = "";
  for (const line of lines) {
    const colon = line.match(/^(.*?)[:：]\s*(.*)$/);
    if (!colon || !colon[1].trim()) {
      pending = pending ? `${pending} ${line}` : line;
      continue;
    }
    const label = cleanFccLabel(pending ? `${pending} ${colon[1]}` : colon[1]);
    const value = colon[2].replace(/^(?:[:：]\s*)+/, "").replace(/\s+/g, " ").trim();
    pending = "";
    if (!label || !value) continue;
    fields.push({ label, value });
  }
  const referrer = extractFccReferrer(body);
  if (referrer && !fields.some((field) => field.value.includes(referrer))) {
    fields.push({ label: "Referrer URL", value: referrer });
  }
  return fields.map((field) => `${field.label}: ${field.value}`).join("\n").trim();
}

export function hktDate(input: Date | number | string): string {
  const date = input instanceof Date ? input : new Date(input);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function sameInquiryContent(value: string): string {
  return String(value || "").replace(/\r\n/g, "\n").trim();
}

export function inquiryAlreadyOpened(taskName: string, taskNotes: string, title: string, notes: string): boolean {
  const expectedTitle = String(title || "").trim();
  const expectedNotes = sameInquiryContent(notes);
  if (!expectedTitle || !expectedNotes) return false;
  return String(taskName || "").trim() === expectedTitle && sameInquiryContent(taskNotes) === expectedNotes;
}

export function parseFccSubject(subject: string): { name: string; phone: string; company: string } {
  const match = String(subject || "").match(/[:：]\s*(.+?)\s+-\s*(\d[\d\s]*\d)\s*(.*)$/);
  if (!match) return { name: "", phone: "", company: "" };
  return {
    name: match[1].trim(),
    phone: formatFccPhone(match[2]),
    company: match[3].split("/")[0].trim(),
  };
}

export function parseFccInquiry(
  body: string,
  rule: FccMailRule,
  subject = "",
): { ok: true; mail: FccParsedMail } | { ok: false; reason: string } {
  const source = normalizeFccBody(body);
  const catering = CATERING_PATTERNS.some((pattern) => pattern.test(source));
  const lunch = LUNCH_PATTERNS.some((pattern) => pattern.test(source));
  if (!catering && !lunch) {
    return { ok: false, reason: "郵件沒有飯盒或到會選項，不開 task" };
  }
  const route = catering ? "catering" : "lunch";
  const fromSubject = parseFccSubject(subject);
  const name = readField(source, ["姓名", "客人姓名", "名稱"]) || fromSubject.name;
  const phone = formatFccPhone(readField(source, ["聯絡電話", "電話", "手機", "Phone"])) || fromSubject.phone;
  const company = readField(source, ["公司/機構名稱", "公司名稱", "公司", "Company"]) || fromSubject.company;
  if (!name && !phone) {
    return { ok: false, reason: "郵件讀唔到姓名同電話，不開 task" };
  }
  const prefix = route === "catering" ? rule.cateringTitlePrefix : rule.lunchTitlePrefix;
  const title = `${prefix} - ${[name, phone, company].filter(Boolean).join(" ")}`.trim();
  return {
    ok: true,
    mail: {
      route,
      projectGid: route === "catering" ? rule.cateringProjectGid : rule.lunchProjectGid,
      title,
      notes: organizeFccNotes(source),
      name,
      phone,
      company,
    },
  };
}
