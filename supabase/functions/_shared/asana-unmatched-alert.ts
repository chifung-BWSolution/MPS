import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildUnmatchedInquiryEmail, normalizeDigestRecipients } from "../../../src/lib/fccAsanaDigest.ts";
import { sendResendEmail } from "./resend.ts";

type Admin = ReturnType<typeof createClient>;

export async function sendUnmatchedInquiryAlert(
  supabase: Admin,
  input: { department: "BW" | "FC"; ruleCode: string; gmailMessageId: string; subject: string; receivedOn: string },
): Promise<void> {
  const { data, error } = await supabase
    .from("asana_mail_rules")
    .select("digest_recipients")
    .eq("code", "fcc")
    .maybeSingle();
  if (error || !data) return;
  const recipients = normalizeDigestRecipients((data.digest_recipients as string[] | null) || []);
  if (recipients.length === 0) return;
  const email = buildUnmatchedInquiryEmail({
    department: input.department,
    subjectLine: input.subject,
    receivedOn: input.receivedOn,
  });
  await sendResendEmail({
    to: recipients,
    subject: email.subject,
    html: email.html,
    text: email.text,
    idempotencyKey: `asana-unmatched/${input.ruleCode}/${input.gmailMessageId}`,
  });
}
