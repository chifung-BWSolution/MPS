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
      const match = line.match(new RegExp(`^${label}\\s*[:：]\\s*(.*)$`));
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

export function organizeFccNotes(body: string): string {
  const cut = body.search(/了解條款及政策/);
  const main = cut >= 0 ? body.slice(0, cut) : body;
  const lines = main.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (/[:：]/.test(lines[i])) {
      out.push(lines[i].replace(/\s*[:：]\s*/, ": "));
      continue;
    }
    const next = lines[i + 1];
    if (next && !/[:：]/.test(next)) {
      out.push(`${lines[i]}: ${next}`);
      i += 1;
    } else {
      out.push(lines[i]);
    }
  }
  const referrer = extractFccReferrer(body);
  if (referrer && !out.some((line) => line.includes(referrer))) {
    out.push(`Referrer: ${referrer}`);
  }
  return out.join("\n").trim();
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

export function inquiryAlreadyInAsana(taskName: string, phone: string, title: string): boolean {
  const name = String(taskName || "").trim();
  if (title && name === title.trim()) return true;
  const digits = String(phone || "").replace(/\D/g, "");
  const local = digits.length === 11 && digits.startsWith("852") ? digits.slice(3) : digits;
  return local.length >= 8 && name.replace(/\D/g, "").includes(local);
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
  const company = readField(source, ["公司名稱", "公司", "Company"]) || fromSubject.company;
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
