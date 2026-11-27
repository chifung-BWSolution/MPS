import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Bell, Code2, Copy, Download, FileText, Link2, ListTodo, Mail, Plus, Settings2, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useWebsiteProfiles } from '@/hooks/useWebsiteProfiles';
import { InquiryFormView } from '@/components/website/InquiryFormView';
import { applyInquiryEmailTokens } from '@/lib/inquiryFormEmail';
import {
  INQUIRY_FILE_TYPE_OPTIONS,
  INQUIRY_FIELD_TYPES,
  inquiryPublicUrl,
  isInquiryChoiceField,
  splitFieldOptions,
  type InquiryField,
  type InquiryFieldType,
} from '@/lib/inquiryForm';
import type { WebsiteProfileFull } from '@/types/app';

type LinkDraft = {
  id: string;
  websiteId: string;
  saved: boolean;
};

type FieldDraft = {
  id: string;
  label: string;
  fieldType: InquiryFieldType;
  required: boolean;
  placeholder: string;
  optionsText: string;
  fileMaxCount: number;
  fileMaxSizeMb: number;
  fileAccept: string[];
};

type FormDraft = {
  id: string;
  name: string;
  description: string;
  createdByName: string;
  updatedAt: string | null;
  languageCode: 'zh-Hant' | 'en';
  timezone: string;
  published: boolean;
  submitButtonText: string;
  labelAlignment: 'top' | 'left' | 'right';
  submitAlignment: 'left' | 'center' | 'right';
  confirmationType: 'message' | 'redirect';
  confirmationMessage: string;
  redirectUrl: string;
  opensAt: string;
  closesAt: string;
  maxEntries: string;
  oneEntryPerIp: boolean;
  notificationEnabled: boolean;
  notificationRecipientsText: string;
  notificationReplyToFieldId: string;
  notificationSubject: string;
  notificationShowEmptyFields: boolean;
  notificationIncludeIp: boolean;
  notificationIncludeReferrer: boolean;
  autoresponderEnabled: boolean;
  autoresponderRecipientFieldId: string;
  autoresponderSenderName: string;
  autoresponderReplyTo: string;
  autoresponderSubject: string;
  autoresponderMessage: string;
  autoresponderIncludeCopy: boolean;
  asanaEnabled: boolean;
  asanaProjectGid: string;
  asanaProjectName: string;
  asanaAssigneeGid: string;
  asanaAssigneeName: string;
  asanaAssigneeEmail: string;
  asanaCollaboratorGids: string[];
  asanaTaskNameTemplate: string;
  fields: FieldDraft[];
  links: LinkDraft[];
  isNew: boolean;
};

type FormRow = {
  id: string;
  name: string;
  description: string | null;
  created_by_name: string | null;
  updated_at: string;
  language_code: 'zh-Hant' | 'en';
  timezone: string;
  published: boolean;
  submit_button_text: string;
  label_alignment: 'top' | 'left' | 'right';
  submit_alignment: 'left' | 'center' | 'right';
  confirmation_type: 'message' | 'redirect';
  confirmation_message: string;
  redirect_url: string;
  opens_at: string | null;
  closes_at: string | null;
  max_entries: number | null;
  one_entry_per_ip: boolean;
  notification_enabled: boolean;
  notification_recipients: string[] | null;
  notification_reply_to_field_id: string | null;
  notification_subject: string;
  notification_show_empty_fields: boolean;
  notification_include_ip: boolean;
  notification_include_referrer: boolean;
  autoresponder_enabled: boolean;
  autoresponder_recipient_field_id: string | null;
  autoresponder_sender_name: string;
  autoresponder_reply_to: string;
  autoresponder_subject: string;
  autoresponder_message: string;
  autoresponder_include_copy: boolean;
  asana_enabled: boolean;
  asana_project_gid: string;
  asana_project_name: string;
  asana_assignee_gid: string;
  asana_assignee_name: string;
  asana_assignee_email: string;
  asana_collaborator_gids: string[] | null;
  asana_task_name_template: string;
};

type LinkRow = {
  id: string;
  form_id: string;
  website_id: string | null;
  sort_order: number;
};

type FieldRow = {
  id: string;
  form_id: string;
  label: string;
  field_type: InquiryFieldType;
  required: boolean;
  placeholder: string | null;
  options: string[] | null;
  file_max_count: number;
  file_max_size_mb: number;
  file_accept: string[] | null;
  sort_order: number;
};

type SubmissionRow = {
  id: string;
  form_id: string;
  link_id: string;
  answers: {
    label?: string;
    value?: string | string[];
    files?: { name: string; path: string; size: number; type: string }[];
  }[];
  created_at: string;
  referrer: string | null;
  notification_error: string | null;
  autoresponder_error: string | null;
  asana_task_gid: string | null;
  asana_error: string | null;
};

type AsanaPerson = { gid: string; name: string; email: string };
type AsanaProject = { gid: string; name: string };

const inputClass = 'w-full min-h-11 rounded-md border border-slate-300 bg-white px-3 text-[14px] text-slate-900 outline-none focus:border-sky-600';
const fieldLabelClass = 'block text-[13px] font-medium text-slate-800';

type FormPanel = 'build' | 'settings' | 'notifications' | 'asana' | 'links' | 'responses';

function templateChoices(form: FormDraft): Array<{ label: string; token: string }> {
  const fields = form.fields.filter((field) => field.label.trim() && field.fieldType !== 'section');
  return [
    { label: '表格名稱', token: '{{form_name}}' },
    { label: '網站名稱', token: '{{website_name}}' },
    ...fields.map((field) => ({ label: field.label.trim(), token: `{{field:${field.label.trim()}}}` })),
  ];
}

function previewTemplate(template: string, form: FormDraft): string {
  return applyInquiryEmailTokens(template, {
    formName: form.name.trim() || '表格名稱',
    websiteName: '所選網站',
    answers: form.fields
      .filter((field) => field.label.trim())
      .map((field) => ({ label: field.label.trim(), value: `（${field.label.trim()}）` })),
  });
}

function TokenComposer({
  label,
  value,
  form,
  disabled,
  multiline,
  onChange,
}: {
  label: string;
  value: string;
  form: FormDraft;
  disabled?: boolean;
  multiline?: boolean;
  onChange: (value: string) => void;
}) {
  const choices = templateChoices(form);
  const preview = previewTemplate(value, form);
  return (
    <div>
      <label className={fieldLabelClass}>
        {label}
        {multiline ? (
          <textarea className={`${inputClass} mt-1 min-h-28 py-2`} disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)} />
        ) : (
          <input className={`${inputClass} mt-1`} disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)} />
        )}
      </label>
      <p className="mt-2 text-[13px] text-slate-600">按一下加入，不用自己打代碼。</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {choices.map((choice) => {
          const used = value.includes(choice.token);
          return (
            <button
              key={choice.token}
              type="button"
              disabled={disabled || used}
              className="inline-flex min-h-11 cursor-pointer items-center rounded-full border border-sky-200 bg-white px-3 text-[13px] font-medium text-sky-950 hover:bg-sky-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 disabled:cursor-not-allowed disabled:opacity-40"
              onClick={() => onChange(value.trim() ? `${value} ${choice.token}` : choice.token)}
            >
              {choice.label}
            </button>
          );
        })}
      </div>
      <p className="mt-2 rounded-md bg-slate-100 px-3 py-2 text-[13px] leading-5 text-slate-800">實際會顯示：{preview || '（空白）'}</p>
    </div>
  );
}

function isoToZonedInput(value: string | null, timeZone: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

function zonedInputToIso(value: string, timeZone: string): string | null {
  if (!value.trim()) return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  const wallUtc = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  let guess = wallUtc;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(guess));
    const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((item) => item.type === type)?.value || 0);
    const shownUtc = Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'));
    guess += wallUtc - shownUtc;
  }
  return new Date(guess).toISOString();
}

function splitEmails(value: string): string[] {
  const seen = new Set<string>();
  const emails: string[] = [];
  for (const raw of value.split(/[\n,;]+/)) {
    const email = raw.trim().toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    emails.push(email);
  }
  return emails;
}

function createFormDraft(displayName: string): FormDraft {
  return {
    id: crypto.randomUUID(),
    name: '',
    description: '',
    createdByName: displayName,
    updatedAt: null,
    languageCode: 'zh-Hant',
    timezone: 'Asia/Hong_Kong',
    published: true,
    submitButtonText: '送出',
    labelAlignment: 'top',
    submitAlignment: 'left',
    confirmationType: 'message',
    confirmationMessage: '已收到，多謝你的資料。我們會盡快跟進。',
    redirectUrl: '',
    opensAt: '',
    closesAt: '',
    maxEntries: '',
    oneEntryPerIp: false,
    notificationEnabled: false,
    notificationRecipientsText: '',
    notificationReplyToFieldId: '',
    notificationSubject: '新表格回覆 — {{form_name}}',
    notificationShowEmptyFields: false,
    notificationIncludeIp: false,
    notificationIncludeReferrer: true,
    autoresponderEnabled: false,
    autoresponderRecipientFieldId: '',
    autoresponderSenderName: '',
    autoresponderReplyTo: '',
    autoresponderSubject: '已收到你的 {{form_name}}',
    autoresponderMessage: '多謝你的查詢，我們已收到資料，會盡快跟進。',
    autoresponderIncludeCopy: true,
    asanaEnabled: false,
    asanaProjectGid: '',
    asanaProjectName: '',
    asanaAssigneeGid: '',
    asanaAssigneeName: '',
    asanaAssigneeEmail: '',
    asanaCollaboratorGids: [],
    asanaTaskNameTemplate: '{{form_name}}',
    fields: [],
    links: [],
    isNew: true,
  };
}

function websiteLabel(site: WebsiteProfileFull): string {
  const domain = (site.domainUrl || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
  return domain ? `${site.websiteName} · ${domain}` : site.websiteName;
}

function prepareLinks(links: LinkDraft[]): { ok: true; links: LinkDraft[] } | { ok: false; message: string } {
  const kept: LinkDraft[] = [];
  for (const link of links) {
    const websiteId = link.websiteId.trim();
    if (!websiteId) return { ok: false, message: '每條連結都要揀它放在哪個網站。' };
    kept.push({ ...link, websiteId });
  }
  return { ok: true, links: kept };
}

function prepareFields(fields: FieldDraft[]): { ok: true; fields: InquiryField[] } | { ok: false; message: string } {
  const kept: InquiryField[] = [];
  for (const field of fields) {
    const label = field.label.trim();
    const options = splitFieldOptions(field.optionsText);
    if (!label && options.length === 0 && !field.placeholder.trim()) continue;
    if (!label) return { ok: false, message: '每個欄位都要有名稱。' };
    if (isInquiryChoiceField(field.fieldType) && options.length === 0) {
      return { ok: false, message: `「${label}」要有最少一個選項，一行一個。` };
    }
    kept.push({
      id: field.id,
      label,
      fieldType: field.fieldType,
      required: field.fieldType === 'terms' ? true : field.required,
      placeholder: field.placeholder.trim(),
      options: isInquiryChoiceField(field.fieldType) ? options : [],
      fileMaxCount: field.fileMaxCount <= 0 ? 0 : Math.min(20, Math.max(1, field.fileMaxCount)),
      fileMaxSizeMb: Math.min(20, Math.max(1, field.fileMaxSizeMb || 10)),
      fileAccept: field.fieldType === 'file' ? field.fileAccept : [],
    });
  }
  return { ok: true, fields: kept };
}

function answerText(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value.join('、');
  return value || '—';
}

function fieldPayload(formId: string, fields: InquiryField[], now: string) {
  return fields.map((field, index) => ({
    id: field.id,
    form_id: formId,
    label: field.label,
    field_type: field.fieldType,
    required: field.required,
    placeholder: field.placeholder,
    options: field.options,
    file_max_count: field.fileMaxCount,
    file_max_size_mb: field.fileMaxSizeMb,
    file_accept: field.fileAccept,
    sort_order: index,
    updated_at: now,
  }));
}

function linkPayload(formId: string, links: LinkDraft[], now: string) {
  return links.map((link, index) => ({
    id: link.id,
    form_id: formId,
    url: `/inquiry/${link.id}`,
    website_id: link.websiteId,
    sort_order: index,
    updated_at: now,
  }));
}

async function syncByForm(
  table: 'inquiry_form_fields' | 'inquiry_form_links',
  formId: string,
  rows: Record<string, unknown>[],
): Promise<string | null> {
  const existing = await supabase.from(table).select('id').eq('form_id', formId);
  if (existing.error) return existing.error.message;
  const keep = new Set(rows.map((row) => String(row.id)));
  const removeIds = ((existing.data || []) as { id: string }[]).map((row) => row.id).filter((id) => !keep.has(id));
  if (removeIds.length > 0) {
    const removed = await supabase.from(table).delete().in('id', removeIds);
    if (removed.error) return removed.error.message;
  }
  if (rows.length > 0) {
    const upserted = await supabase.from(table).upsert(rows);
    if (upserted.error) return upserted.error.message;
  }
  return null;
}

function WebsiteSearch({
  sites,
  selectedId,
  onPick,
}: {
  sites: WebsiteProfileFull[];
  selectedId: string;
  onPick: (site: WebsiteProfileFull | null) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const selected = sites.find((site) => site.id === selectedId);
  const needle = query.trim().toLowerCase();
  const matches = needle
    ? sites.filter((site) => websiteLabel(site).toLowerCase().includes(needle)).slice(0, 8)
    : [];

  return (
    <div>
      {selected ? (
        <div className="mb-2 flex min-h-11 items-center justify-between gap-2 rounded-md border border-sky-200 bg-sky-50 px-3">
          <p className="text-[14px] font-medium text-slate-900">{websiteLabel(selected)}</p>
          <button
            type="button"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-600 hover:bg-sky-100"
            aria-label="清除網站"
            onClick={() => onPick(null)}
          >
            <X size={14} />
          </button>
        </div>
      ) : selectedId ? (
        <p className="mb-2 text-[14px] text-amber-800">這個網站已不在列表，請再揀一個。</p>
      ) : (
        <p className="mb-2 text-[14px] text-slate-600">未選網站</p>
      )}
      <div className="relative">
        <input
          className={inputClass}
          value={query}
          placeholder="搜尋網站名稱或網址"
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
        {open && needle && (
          <div className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-slate-200 bg-white shadow-md">
            {matches.length === 0 && <p className="px-3 py-2 text-[14px] text-slate-600">找不到這個網站</p>}
            {matches.map((site) => (
              <button
                key={site.id}
                type="button"
                className="block w-full px-3 py-2 text-left text-[14px] text-slate-900 hover:bg-sky-50"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onPick(site);
                  setQuery('');
                  setOpen(false);
                }}
              >
                {websiteLabel(site)}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function FormSettingsPage() {
  const { systemUser } = useAuth();
  const { profiles, loading: sitesLoading } = useWebsiteProfiles();
  const [forms, setForms] = useState<FormDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [downloadingPath, setDownloadingPath] = useState<string | null>(null);
  const [loadError, setLoadError] = useState('');
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [panels, setPanels] = useState<Record<string, FormPanel>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [asanaPeople, setAsanaPeople] = useState<AsanaPerson[]>([]);
  const [asanaProjects, setAsanaProjects] = useState<AsanaProject[]>([]);
  const [asanaDirectoryError, setAsanaDirectoryError] = useState('');

  const sites = useMemo(
    () => profiles
      .filter((site) => site.profileType !== 'system' && site.status !== 'archived')
      .slice()
      .sort((a, b) => a.websiteName.localeCompare(b.websiteName, 'zh-Hant')),
    [profiles],
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const [formRes, linkRes, fieldRes, replyRes] = await Promise.all([
        supabase.from('inquiry_forms').select('*').order('updated_at', { ascending: false }),
        supabase.from('inquiry_form_links').select('id, form_id, website_id, sort_order').order('sort_order', { ascending: true }),
        supabase.from('inquiry_form_fields').select('id, form_id, label, field_type, required, placeholder, options, file_max_count, file_max_size_mb, file_accept, sort_order').order('sort_order', { ascending: true }),
        supabase.from('inquiry_form_submissions').select('id, form_id, link_id, answers, created_at, referrer, notification_error, autoresponder_error, asana_task_gid, asana_error').order('created_at', { ascending: false }).limit(200),
      ]);
      if (cancelled) return;
      if (formRes.error || linkRes.error || fieldRes.error || replyRes.error) {
        setLoadError(formRes.error?.message || linkRes.error?.message || fieldRes.error?.message || replyRes.error?.message || '讀取失敗');
        setLoading(false);
        return;
      }
      const linksByForm = new Map<string, LinkDraft[]>();
      for (const row of (linkRes.data || []) as LinkRow[]) {
        const list = linksByForm.get(row.form_id) || [];
        list.push({ id: row.id, websiteId: row.website_id || '', saved: true });
        linksByForm.set(row.form_id, list);
      }
      const fieldsByForm = new Map<string, FieldDraft[]>();
      for (const row of (fieldRes.data || []) as FieldRow[]) {
        const list = fieldsByForm.get(row.form_id) || [];
        list.push({
          id: row.id,
          label: row.label,
          fieldType: row.field_type,
          required: row.required,
          placeholder: row.placeholder || '',
          optionsText: (row.options || []).join('\n'),
          fileMaxCount: row.file_max_count === 0 ? 0 : (row.file_max_count || 3),
          fileMaxSizeMb: row.file_max_size_mb || 10,
          fileAccept: row.file_accept || [],
        });
        fieldsByForm.set(row.form_id, list);
      }
      setSubmissions((replyRes.data || []) as SubmissionRow[]);
      setForms(((formRes.data || []) as FormRow[]).map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description || '',
        createdByName: row.created_by_name || '',
        updatedAt: row.updated_at,
        languageCode: row.language_code === 'en' ? 'en' : 'zh-Hant',
        timezone: row.timezone || 'Asia/Hong_Kong',
        published: row.published !== false,
        submitButtonText: row.submit_button_text || '送出',
        labelAlignment: row.label_alignment || 'top',
        submitAlignment: row.submit_alignment || 'left',
        confirmationType: row.confirmation_type || 'message',
        confirmationMessage: row.confirmation_message || '',
        redirectUrl: row.redirect_url || '',
        opensAt: isoToZonedInput(row.opens_at, row.timezone || 'Asia/Hong_Kong'),
        closesAt: isoToZonedInput(row.closes_at, row.timezone || 'Asia/Hong_Kong'),
        maxEntries: row.max_entries ? String(row.max_entries) : '',
        oneEntryPerIp: row.one_entry_per_ip === true,
        notificationEnabled: row.notification_enabled === true,
        notificationRecipientsText: (row.notification_recipients || []).join('\n'),
        notificationReplyToFieldId: row.notification_reply_to_field_id || '',
        notificationSubject: row.notification_subject || '新表格回覆 — {{form_name}}',
        notificationShowEmptyFields: row.notification_show_empty_fields === true,
        notificationIncludeIp: row.notification_include_ip === true,
        notificationIncludeReferrer: row.notification_include_referrer !== false,
        autoresponderEnabled: row.autoresponder_enabled === true,
        autoresponderRecipientFieldId: row.autoresponder_recipient_field_id || '',
        autoresponderSenderName: row.autoresponder_sender_name || '',
        autoresponderReplyTo: row.autoresponder_reply_to || '',
        autoresponderSubject: row.autoresponder_subject || '已收到你的 {{form_name}}',
        autoresponderMessage: row.autoresponder_message || '',
        autoresponderIncludeCopy: row.autoresponder_include_copy !== false,
        asanaEnabled: row.asana_enabled === true,
        asanaProjectGid: row.asana_project_gid || '',
        asanaProjectName: row.asana_project_name || '',
        asanaAssigneeGid: row.asana_assignee_gid || '',
        asanaAssigneeName: row.asana_assignee_name || '',
        asanaAssigneeEmail: row.asana_assignee_email || '',
        asanaCollaboratorGids: row.asana_collaborator_gids || [],
        asanaTaskNameTemplate: row.asana_task_name_template || '{{form_name}}',
        fields: fieldsByForm.get(row.id) || [],
        links: linksByForm.get(row.id) || [],
        isNew: false,
      })));
      setLoadError('');
      setLoading(false);
    }
    void load();
    void loadAsanaDirectory();
    return () => {
      cancelled = true;
    };
  }, []);

  async function loadAsanaDirectory() {
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
      const { data: sessionData } = await supabase.auth.getSession();
      const response = await fetch(`${supabaseUrl}/functions/v1/sync-fcc-asana-mail`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${sessionData.session?.access_token || supabaseAnonKey}`,
          apikey: supabaseAnonKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'users' }),
      });
      const payload = await response.json() as { users?: AsanaPerson[]; projects?: AsanaProject[]; error?: string };
      if (!response.ok || payload.error) throw new Error(payload.error || '未能讀取 Asana');
      setAsanaPeople(payload.users || []);
      setAsanaProjects(payload.projects || []);
      setAsanaDirectoryError('');
    } catch (error) {
      setAsanaDirectoryError(error instanceof Error ? error.message : '未能讀取 Asana');
    }
  }

  const visibleForms = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return forms;
    return forms.filter((form) => {
      const siteNames = form.links.map((link) => {
        const site = sites.find((item) => item.id === link.websiteId);
        return site ? websiteLabel(site) : '';
      });
      return [form.name, form.createdByName, ...form.fields.map((field) => field.label), ...siteNames]
        .join(' ')
        .toLowerCase()
        .includes(needle);
    });
  }, [forms, query, sites]);

  function updateForm(id: string, patch: Partial<FormDraft>) {
    setForms((current) => current.map((form) => (form.id === id ? { ...form, ...patch } : form)));
  }

  function updateField(formId: string, fieldId: string, patch: Partial<FieldDraft>) {
    setForms((current) => current.map((form) => {
      if (form.id !== formId) return form;
      return {
        ...form,
        fields: form.fields.map((field) => (field.id === fieldId ? { ...field, ...patch } : field)),
      };
    }));
  }

  function moveField(formId: string, fieldId: string, direction: -1 | 1) {
    setForms((current) => current.map((form) => {
      if (form.id !== formId) return form;
      const index = form.fields.findIndex((field) => field.id === fieldId);
      const next = index + direction;
      if (index < 0 || next < 0 || next >= form.fields.length) return form;
      const fields = form.fields.slice();
      const [item] = fields.splice(index, 1);
      fields.splice(next, 0, item);
      return { ...form, fields };
    }));
  }

  function addField(formId: string, fieldType: InquiryFieldType) {
    const typeLabel = INQUIRY_FIELD_TYPES.find((item) => item.id === fieldType)?.label || '欄位';
    const label = fieldType === 'section'
      ? '新分段'
      : fieldType === 'terms'
        ? '我同意以上條款'
        : typeLabel;
    updateForm(formId, {
      fields: [
        ...(forms.find((form) => form.id === formId)?.fields || []),
        {
          id: crypto.randomUUID(),
          label,
          fieldType,
          required: fieldType === 'terms',
          placeholder: '',
          optionsText: '',
          fileMaxCount: 3,
          fileMaxSizeMb: 10,
          fileAccept: [],
        },
      ],
    });
  }

  function updateLink(formId: string, linkId: string, patch: Partial<LinkDraft>) {
    setForms((current) => current.map((form) => {
      if (form.id !== formId) return form;
      return {
        ...form,
        links: form.links.map((link) => (link.id === linkId ? { ...link, ...patch } : link)),
      };
    }));
  }

  async function downloadSubmissionFile(path: string, name: string) {
    setDownloadingPath(path);
    const { data, error } = await supabase.storage.from('inquiry-form-files').createSignedUrl(path, 60 * 60, {
      download: name,
    });
    setDownloadingPath(null);
    if (error || !data?.signedUrl) {
      toast.error('未能下載檔案', { description: error?.message });
      return;
    }
    const anchor = document.createElement('a');
    anchor.href = data.signedUrl;
    anchor.download = name;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  async function saveForm(form: FormDraft) {
    const name = form.name.trim();
    if (!name) {
      toast.error('先寫表格名稱');
      return;
    }
    const preparedFields = prepareFields(form.fields);
    if (!preparedFields.ok) {
      toast.error('message' in preparedFields ? preparedFields.message : '欄位設定不正確');
      return;
    }
    const prepared = prepareLinks(form.links);
    if (!prepared.ok) {
      toast.error('message' in prepared ? prepared.message : '連結設定不正確');
      return;
    }
    const opensAt = zonedInputToIso(form.opensAt, form.timezone);
    const closesAt = zonedInputToIso(form.closesAt, form.timezone);
    if (opensAt && closesAt && new Date(opensAt) >= new Date(closesAt)) {
      toast.error('停止收表時間要遲過開始收表時間');
      return;
    }
    const maxEntries = form.maxEntries.trim() ? Number(form.maxEntries) : null;
    if (maxEntries !== null && (!Number.isInteger(maxEntries) || maxEntries <= 0)) {
      toast.error('回覆上限要填正整數');
      return;
    }
    if (form.confirmationType === 'redirect' && !/^https?:\/\//i.test(form.redirectUrl.trim())) {
      toast.error('轉到其他頁面的網址要以 https:// 開始');
      return;
    }
    const notificationRecipients = splitEmails(form.notificationRecipientsText);
    if (form.notificationEnabled && notificationRecipients.length === 0) {
      toast.error('開啟通知電郵前，先加入最少一個收件人');
      return;
    }
    if (notificationRecipients.some((email) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))) {
      toast.error('通知收件人有電郵格式不正確');
      return;
    }
    const emailFieldIds = new Set(preparedFields.fields.filter((field) => field.fieldType === 'email').map((field) => field.id));
    if (form.autoresponderEnabled && !emailFieldIds.has(form.autoresponderRecipientFieldId)) {
      toast.error('自動回覆要揀一個電郵欄位做收件人');
      return;
    }
    if (form.asanaEnabled && (!form.asanaProjectGid.trim() || !form.asanaAssigneeGid.trim())) {
      toast.error('開啟 Asana 前，先揀專案和負責人');
      return;
    }
    setSavingId(form.id);
    const now = new Date().toISOString();
    const staffId = systemUser?.staff_id && /^[0-9a-f-]{36}$/i.test(systemUser.staff_id) ? systemUser.staff_id : null;
    const formPayload = {
      name,
      description: form.description.trim(),
      language_code: form.languageCode,
      timezone: form.timezone,
      published: form.published,
      submit_button_text: form.submitButtonText.trim() || '送出',
      label_alignment: form.labelAlignment,
      submit_alignment: form.submitAlignment,
      confirmation_type: form.confirmationType,
      confirmation_message: form.confirmationMessage.trim(),
      redirect_url: form.redirectUrl.trim(),
      opens_at: opensAt,
      closes_at: closesAt,
      max_entries: maxEntries,
      one_entry_per_ip: form.oneEntryPerIp,
      notification_enabled: form.notificationEnabled,
      notification_recipients: notificationRecipients,
      notification_reply_to_field_id: emailFieldIds.has(form.notificationReplyToFieldId) ? form.notificationReplyToFieldId : null,
      notification_subject: form.notificationSubject.trim() || '新表格回覆 — {{form_name}}',
      notification_show_empty_fields: form.notificationShowEmptyFields,
      notification_include_ip: form.notificationIncludeIp,
      notification_include_referrer: form.notificationIncludeReferrer,
      autoresponder_enabled: form.autoresponderEnabled,
      autoresponder_recipient_field_id: emailFieldIds.has(form.autoresponderRecipientFieldId) ? form.autoresponderRecipientFieldId : null,
      autoresponder_sender_name: form.autoresponderSenderName.trim(),
      autoresponder_reply_to: form.autoresponderReplyTo.trim(),
      autoresponder_subject: form.autoresponderSubject.trim() || '已收到你的 {{form_name}}',
      autoresponder_message: form.autoresponderMessage.trim(),
      autoresponder_include_copy: form.autoresponderIncludeCopy,
      asana_enabled: form.asanaEnabled,
      asana_project_gid: form.asanaProjectGid.trim(),
      asana_project_name: form.asanaProjectName.trim(),
      asana_assignee_gid: form.asanaAssigneeGid.trim(),
      asana_assignee_name: form.asanaAssigneeName.trim(),
      asana_assignee_email: form.asanaAssigneeEmail.trim(),
      asana_collaborator_gids: form.asanaCollaboratorGids,
      asana_task_name_template: form.asanaTaskNameTemplate.trim() || '{{form_name}}',
      updated_at: now,
    };
    let formId = form.id;
    let createdByName = form.createdByName;
    if (form.isNew) {
      const inserted = await supabase.from('inquiry_forms').insert({
        ...formPayload,
        created_by_staff_id: staffId,
        created_by_name: systemUser?.display_name || '',
      }).select('id, created_by_name, updated_at').single();
      if (inserted.error || !inserted.data) {
        setSavingId(null);
        toast.error('儲存失敗', { description: inserted.error?.message });
        return;
      }
      formId = inserted.data.id as string;
      createdByName = (inserted.data.created_by_name as string) || systemUser?.display_name || '';
    } else {
      const updated = await supabase.from('inquiry_forms').update(formPayload).eq('id', formId);
      if (updated.error) {
        setSavingId(null);
        toast.error('儲存失敗', { description: updated.error.message });
        return;
      }
    }
    const fieldError = await syncByForm('inquiry_form_fields', formId, fieldPayload(formId, preparedFields.fields, now));
    if (fieldError) {
      setForms((current) => current.map((item) => (item.id === form.id ? {
        ...item,
        id: formId,
        name,
        isNew: false,
        createdByName,
        updatedAt: now,
      } : item)));
      setSavingId(null);
      toast.error('表格已建立，欄位未寫入。再按儲存。', { description: fieldError });
      return;
    }
    const linkError = await syncByForm('inquiry_form_links', formId, linkPayload(formId, prepared.links, now));
    if (linkError) {
      setForms((current) => current.map((item) => (item.id === form.id ? {
        ...item,
        id: formId,
        name,
        fields: preparedFields.fields.map((field) => ({
          id: field.id,
          label: field.label,
          fieldType: field.fieldType,
          required: field.required,
          placeholder: field.placeholder,
          optionsText: field.options.join('\n'),
          fileMaxCount: field.fileMaxCount,
          fileMaxSizeMb: field.fileMaxSizeMb,
          fileAccept: field.fileAccept,
        })),
        isNew: false,
        createdByName,
        updatedAt: now,
      } : item)));
      setSavingId(null);
      toast.error('欄位已儲存，連結未寫入。再按儲存。', { description: linkError });
      return;
    }
    setForms((current) => current.map((item) => (item.id === form.id ? {
      ...item,
      id: formId,
      name,
      fields: preparedFields.fields.map((field) => ({
        id: field.id,
        label: field.label,
        fieldType: field.fieldType,
        required: field.required,
        placeholder: field.placeholder,
        optionsText: field.options.join('\n'),
        fileMaxCount: field.fileMaxCount,
        fileMaxSizeMb: field.fileMaxSizeMb,
        fileAccept: field.fileAccept,
      })),
      links: prepared.links.map((link) => ({ ...link, saved: true })),
      isNew: false,
      createdByName,
      updatedAt: now,
    } : item)));
    setSavingId(null);
    toast.success('已儲存');
  }

  async function deleteForm(form: FormDraft) {
    if (!window.confirm(`刪除「${form.name.trim() || '未命名表格'}」？欄位、連結和已收到的回覆會一併刪除。`)) return;
    if (!form.isNew) {
      const { data, error } = await supabase.functions.invoke('submit-inquiry-form', {
        method: 'DELETE',
        body: { formId: form.id },
      });
      if (error || data?.error) {
        toast.error('刪除失敗', { description: String(data?.error || error?.message || '') });
        return;
      }
    }
    setForms((current) => current.filter((item) => item.id !== form.id));
    setSelectedId((current) => (current === form.id ? null : current));
    toast.success('已刪除');
  }

  const selectedForm = visibleForms.find((form) => form.id === selectedId) ?? visibleForms[0] ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[28px] font-bold tracking-tight text-slate-950">表格設定</h1>
        <button
          type="button"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-md bg-sky-700 px-3 text-[14px] font-medium text-white hover:bg-sky-800"
          onClick={() => {
            const draft = createFormDraft(systemUser?.display_name || '');
            setForms((current) => [draft, ...current]);
            setSelectedId(draft.id);
            setPanels((current) => ({ ...current, [draft.id]: 'build' }));
          }}
        >
          <Plus size={16} /> 新增表格
        </button>
      </div>
      {loadError && <p className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-[14px] text-rose-800">{loadError}</p>}
      <div className="grid items-start gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="rounded-lg border border-slate-200 bg-white p-2 lg:sticky lg:top-3">
          <input
            className={`${inputClass} mb-2`}
            value={query}
            placeholder="搜尋表格"
            aria-label="搜尋表格"
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="max-h-[70vh] space-y-1 overflow-y-auto">
            {loading && <p className="px-2 py-3 text-[14px] text-slate-600">載入中…</p>}
            {!loading && visibleForms.length === 0 && <p className="px-2 py-3 text-[14px] text-slate-600">未有表格</p>}
            {visibleForms.map((item) => {
              const active = selectedForm?.id === item.id;
              const replies = submissions.filter((submission) => submission.form_id === item.id).length;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-current={active ? 'true' : undefined}
                  className={`block w-full rounded-md px-3 py-2 text-left ${active ? 'bg-sky-50 text-sky-950' : 'text-slate-800 hover:bg-slate-50'}`}
                  onClick={() => setSelectedId(item.id)}
                >
                  <span className="block truncate text-[14px] font-semibold">{item.name.trim() || '未命名表格'}</span>
                  <span className="mt-1 flex flex-wrap gap-x-2 text-[12px] text-slate-500">
                    <span>{item.fields.length} 欄</span>
                    <span>{item.links.length} 連結</span>
                    <span>{replies} 回覆</span>
                    {item.isNew && <span>未儲存</span>}
                  </span>
                </button>
              );
            })}
          </div>
        </aside>
        {selectedForm && (() => {
          const form = selectedForm;
          const panel = panels[form.id] || 'build';
          const formReplies = submissions.filter((item) => item.form_id === form.id);
          const emailFields = form.fields.filter((field) => field.fieldType === 'email' && field.label.trim());
          return (
          <article className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-slate-200 bg-white px-3 py-2">
              <label className="sr-only" htmlFor={`form-name-${form.id}`}>表格名稱</label>
              <input
                id={`form-name-${form.id}`}
                className="min-h-11 min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 text-[18px] font-semibold text-slate-950 outline-none focus:border-sky-600 focus:bg-white"
                value={form.name}
                placeholder="表格名稱"
                onChange={(event) => updateForm(form.id, { name: event.target.value })}
              />
              <button
                type="button"
                className="inline-flex min-h-11 items-center rounded-md px-3 text-[14px] text-rose-800 hover:bg-rose-50"
                onClick={() => void deleteForm(form)}
              >
                刪除
              </button>
              <button
                type="button"
                className="inline-flex min-h-11 items-center rounded-md bg-slate-900 px-4 text-[14px] font-medium text-white hover:bg-slate-800 disabled:opacity-60"
                disabled={savingId === form.id}
                onClick={() => void saveForm(form)}
              >
                {savingId === form.id ? '儲存中…' : '儲存'}
              </button>
            </div>
            <div className="grid lg:grid-cols-[176px_minmax(0,1fr)]">
            <div className="flex gap-1 overflow-x-auto border-b border-slate-200 p-2 lg:flex-col lg:border-b-0 lg:border-r" role="tablist" aria-label={`${form.name || '未命名表格'}設定`}>
              {([
                ['build', '欄位', FileText],
                ['settings', '表格設定', Settings2],
                ['notifications', '通知與回覆', Bell],
                ['asana', 'Asana', ListTodo],
                ['links', '發佈連結', Link2],
                ['responses', `回覆 ${formReplies.length}`, Mail],
              ] as const).map(([id, label, Icon]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={panel === id}
                  className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-md px-3 text-left text-[14px] font-medium ${
                    panel === id ? 'bg-sky-50 text-sky-950' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                  onClick={() => setPanels((current) => ({ ...current, [form.id]: id }))}
                >
                  <Icon size={16} /> {label}
                </button>
              ))}
            </div>
            <div className="min-w-0 p-4">
            {panel === 'build' && (
            <>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div className="space-y-3">
                <p className="text-[13px] font-semibold text-slate-800">欄位</p>
                {form.fields.length === 0 && <p className="text-[14px] text-slate-600">未加欄位。按下面加入，例如姓名、電話、查詢內容。</p>}
                {form.fields.map((field, index) => (
                  <div key={field.id} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-[13px] font-semibold text-slate-800">欄位 {index + 1}</p>
                      <div className="flex items-center">
                        <button type="button" className="inline-flex h-11 w-11 items-center justify-center rounded-md text-slate-700 hover:bg-white" aria-label="上移" onClick={() => moveField(form.id, field.id, -1)}>
                          <ArrowUp size={16} />
                        </button>
                        <button type="button" className="inline-flex h-11 w-11 items-center justify-center rounded-md text-slate-700 hover:bg-white" aria-label="下移" onClick={() => moveField(form.id, field.id, 1)}>
                          <ArrowDown size={16} />
                        </button>
                        <button type="button" className="inline-flex min-h-11 items-center rounded-md px-2 text-[13px] text-slate-700 hover:bg-white" onClick={() => updateForm(form.id, { fields: form.fields.filter((item) => item.id !== field.id) })}>
                          移除
                        </button>
                      </div>
                    </div>
                    <label className="block text-[13px] text-slate-700" htmlFor={`field-label-${field.id}`}>欄位名稱</label>
                    <input
                      id={`field-label-${field.id}`}
                      className={`${inputClass} mt-1`}
                      value={field.label}
                      placeholder="例如 聯絡電話"
                      onChange={(event) => updateField(form.id, field.id, { label: event.target.value })}
                    />
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <label className="block text-[13px] text-slate-700">
                        類型
                        <select
                          className={`${inputClass} mt-1`}
                          value={field.fieldType}
                          onChange={(event) => updateField(form.id, field.id, { fieldType: event.target.value as InquiryFieldType })}
                        >
                          {INQUIRY_FIELD_TYPES.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}
                        </select>
                      </label>
                      <label className="flex min-h-11 items-end gap-2 pb-2 text-[14px] text-slate-900">
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={field.required}
                          onChange={(event) => updateField(form.id, field.id, { required: event.target.checked })}
                        />
                        必填
                      </label>
                    </div>
                    {isInquiryChoiceField(field.fieldType) ? (
                      <label className="mt-3 block text-[13px] text-slate-700">
                        選項，一行一個
                        <textarea
                          className={`${inputClass} mt-1 min-h-24 py-2`}
                          value={field.optionsText}
                          placeholder={'報價\n參觀'}
                          onChange={(event) => updateField(form.id, field.id, { optionsText: event.target.value })}
                        />
                      </label>
                    ) : field.fieldType === 'file' ? (
                      <div className="mt-3 space-y-3 rounded-md border border-sky-200 bg-white p-3">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="block text-[13px] text-slate-700">
                            最多檔案數量
                            <select
                              className={`${inputClass} mt-1`}
                              value={field.fileMaxCount}
                              onChange={(event) => updateField(form.id, field.id, { fileMaxCount: Number(event.target.value) })}
                            >
                              <option value={0}>不限</option>
                              {[1, 2, 3, 4, 5, 10].map((count) => <option key={count} value={count}>{count} 個</option>)}
                            </select>
                          </label>
                          <label className="block text-[13px] text-slate-700">
                            每個檔案上限
                            <select
                              className={`${inputClass} mt-1`}
                              value={field.fileMaxSizeMb}
                              onChange={(event) => updateField(form.id, field.id, { fileMaxSizeMb: Number(event.target.value) })}
                            >
                              {[1, 2, 5, 10, 15, 20].map((size) => <option key={size} value={size}>{size} MB</option>)}
                            </select>
                          </label>
                        </div>
                        <fieldset>
                          <legend className="text-[13px] text-slate-700">接受檔案類型</legend>
                          <label className="mt-2 flex min-h-9 items-center gap-2 text-[13px] text-slate-900">
                            <input
                              type="checkbox"
                              className="h-4 w-4"
                              checked={field.fileAccept.length === 0}
                              onChange={() => updateField(form.id, field.id, { fileAccept: [] })}
                            />
                            全部常用格式
                          </label>
                          <div className="mt-1 grid grid-cols-2 gap-x-3">
                            {INQUIRY_FILE_TYPE_OPTIONS.map((type) => (
                              <label key={type.id} className="flex min-h-9 items-center gap-2 text-[13px] text-slate-900">
                                <input
                                  type="checkbox"
                                  className="h-4 w-4"
                                  checked={field.fileAccept.includes(type.id)}
                                  disabled={field.fileAccept.length === 1 && field.fileAccept.includes(type.id)}
                                  onChange={(event) => updateField(form.id, field.id, {
                                    fileAccept: event.target.checked
                                      ? [...field.fileAccept, type.id]
                                      : field.fileAccept.filter((mime) => mime !== type.id),
                                  })}
                                />
                                {type.label}
                              </label>
                            ))}
                          </div>
                          {field.fileAccept.length === 1 && (
                            <p className="mt-1 text-[12px] text-slate-600">要改回全部格式，請勾選「全部常用格式」。</p>
                          )}
                        </fieldset>
                        <p className="text-[12px] text-slate-600">選「不限」就沒有檔案數量上限。每次送出全部檔案合計仍然最多 20 MB，檔案只供已登入同事下載。</p>
                      </div>
                    ) : (
                      <label className="mt-3 block text-[13px] text-slate-700">
                        提示文字
                        <input
                          className={`${inputClass} mt-1`}
                          value={field.placeholder}
                          placeholder="客人未填時見到的提示"
                          onChange={(event) => updateField(form.id, field.id, { placeholder: event.target.value })}
                        />
                      </label>
                    )}
                  </div>
                ))}
                <div className="rounded-md border border-slate-200 bg-white p-3">
                  <p className="text-[13px] font-semibold text-slate-900">加入欄位</p>
                  <p className="mt-1 text-[12px] text-slate-600">按類型即時加入，之後可改名稱、必填和次序。</p>
                  <div className="mt-3">
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-sky-800">基本</p>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {INQUIRY_FIELD_TYPES.filter((item) => ['text', 'textarea', 'number', 'checkbox', 'radio', 'select', 'checkboxes'].includes(item.id)).map((type) => (
                        <button key={type.id} type="button" className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-sky-200 bg-sky-50 px-3 text-left text-[13px] font-medium text-sky-950 hover:bg-sky-100" onClick={() => addField(form.id, type.id)}>
                          <Plus size={14} /> {type.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="mt-3">
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-800">進階</p>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {INQUIRY_FIELD_TYPES.filter((item) => ['email', 'phone', 'address', 'date', 'website', 'file', 'hidden', 'section', 'terms'].includes(item.id)).map((type) => (
                        <button key={type.id} type="button" className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-3 text-left text-[13px] font-medium text-emerald-950 hover:bg-emerald-100" onClick={() => addField(form.id, type.id)}>
                          <Plus size={14} /> {type.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <div className="rounded-md border border-sky-200 bg-sky-50/40 p-4 lg:sticky lg:top-20 lg:self-start">
                <p className="mb-3 text-[13px] font-semibold text-sky-950">客人會見到</p>
                <InquiryFormView
                  key={form.fields.map((field) => `${field.id}:${field.fieldType}:${field.label}:${field.required}:${field.optionsText}`).join('|')}
                  formName={form.name}
                  description={form.description}
                  fields={form.fields.filter((field) => field.label.trim()).map((field) => ({
                    id: field.id,
                    label: field.label.trim(),
                    fieldType: field.fieldType,
                    required: field.required,
                    placeholder: field.placeholder,
                    options: splitFieldOptions(field.optionsText),
                    fileMaxCount: field.fileMaxCount,
                    fileMaxSizeMb: field.fileMaxSizeMb,
                    fileAccept: field.fileAccept,
                  }))}
                  submitLabel={form.submitButtonText}
                  labelAlignment={form.labelAlignment}
                  submitAlignment={form.submitAlignment}
                />
              </div>
            </div>
            </>
            )}
            {panel === 'settings' && (
              <div className="mt-4 space-y-5">
                <section className="rounded-md border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-[15px] font-semibold text-slate-950">基本資料</h3>
                      <p className="mt-1 text-[13px] text-slate-600">設定客人看到的說明、語言和公開狀態。</p>
                    </div>
                    <label className="flex min-h-11 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-[14px] text-slate-900">
                      <input type="checkbox" className="h-4 w-4" checked={form.published} onChange={(event) => updateForm(form.id, { published: event.target.checked })} />
                      公開接受回覆
                    </label>
                  </div>
                  <label className={fieldLabelClass}>
                    表格說明
                    <textarea
                      className={`${inputClass} mt-1 min-h-24 py-2`}
                      value={form.description}
                      placeholder="告訴客人這份表格的用途、截止日期或注意事項"
                      onChange={(event) => updateForm(form.id, { description: event.target.value })}
                    />
                  </label>
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <label className={fieldLabelClass}>
                      語言
                      <select className={`${inputClass} mt-1`} value={form.languageCode} onChange={(event) => updateForm(form.id, { languageCode: event.target.value as 'zh-Hant' | 'en' })}>
                        <option value="zh-Hant">繁體中文</option>
                        <option value="en">English</option>
                      </select>
                    </label>
                    <label className={fieldLabelClass}>
                      時區
                      <select className={`${inputClass} mt-1`} value={form.timezone} onChange={(event) => updateForm(form.id, { timezone: event.target.value })}>
                        <option value="Asia/Hong_Kong">香港（Asia/Hong_Kong）</option>
                        <option value="Asia/Tokyo">東京（Asia/Tokyo）</option>
                        <option value="Europe/London">倫敦（Europe/London）</option>
                        <option value="America/New_York">紐約（America/New_York）</option>
                      </select>
                    </label>
                  </div>
                </section>

                <section className="rounded-md border border-slate-200 bg-white p-4">
                  <h3 className="text-[15px] font-semibold text-slate-950">顯示與按鈕</h3>
                  <div className="mt-3 grid gap-4 md:grid-cols-3">
                    <label className={fieldLabelClass}>
                      欄位名稱位置
                      <select className={`${inputClass} mt-1`} value={form.labelAlignment} onChange={(event) => updateForm(form.id, { labelAlignment: event.target.value as FormDraft['labelAlignment'] })}>
                        <option value="top">上方（手機最易讀）</option>
                        <option value="left">左邊</option>
                        <option value="right">右邊</option>
                      </select>
                    </label>
                    <label className={fieldLabelClass}>
                      送出按鈕文字
                      <input className={`${inputClass} mt-1`} value={form.submitButtonText} onChange={(event) => updateForm(form.id, { submitButtonText: event.target.value })} />
                    </label>
                    <label className={fieldLabelClass}>
                      按鈕位置
                      <select className={`${inputClass} mt-1`} value={form.submitAlignment} onChange={(event) => updateForm(form.id, { submitAlignment: event.target.value as FormDraft['submitAlignment'] })}>
                        <option value="left">左</option>
                        <option value="center">中</option>
                        <option value="right">右</option>
                      </select>
                    </label>
                  </div>
                </section>

                <section className="rounded-md border border-slate-200 bg-white p-4">
                  <h3 className="text-[15px] font-semibold text-slate-950">送出之後</h3>
                  <div className="mt-3 flex flex-wrap gap-3">
                    <label className="flex min-h-11 items-center gap-2 text-[14px] text-slate-900">
                      <input type="radio" name={`confirmation-${form.id}`} checked={form.confirmationType === 'message'} onChange={() => updateForm(form.id, { confirmationType: 'message' })} />
                      顯示成功訊息
                    </label>
                    <label className="flex min-h-11 items-center gap-2 text-[14px] text-slate-900">
                      <input type="radio" name={`confirmation-${form.id}`} checked={form.confirmationType === 'redirect'} onChange={() => updateForm(form.id, { confirmationType: 'redirect' })} />
                      轉到其他頁面
                    </label>
                  </div>
                  {form.confirmationType === 'message' ? (
                    <label className={`${fieldLabelClass} mt-3`}>
                      成功訊息
                      <textarea className={`${inputClass} mt-1 min-h-20 py-2`} value={form.confirmationMessage} onChange={(event) => updateForm(form.id, { confirmationMessage: event.target.value })} />
                    </label>
                  ) : (
                    <label className={`${fieldLabelClass} mt-3`}>
                      跳轉網址
                      <input className={`${inputClass} mt-1`} type="url" value={form.redirectUrl} placeholder="https://" onChange={(event) => updateForm(form.id, { redirectUrl: event.target.value })} />
                    </label>
                  )}
                </section>

                <section className="rounded-md border border-slate-200 bg-white p-4">
                  <h3 className="text-[15px] font-semibold text-slate-950">收表限制與防濫用</h3>
                  <p className="mt-1 text-[13px] text-slate-600">每份表格都已啟用隱藏防機械人欄位、最短填寫時間和每分鐘限速。</p>
                  <div className="mt-3 grid gap-4 md:grid-cols-3">
                    <label className={fieldLabelClass}>
                      開始收表
                      <input className={`${inputClass} mt-1`} type="datetime-local" value={form.opensAt} onChange={(event) => updateForm(form.id, { opensAt: event.target.value })} />
                    </label>
                    <label className={fieldLabelClass}>
                      停止收表
                      <input className={`${inputClass} mt-1`} type="datetime-local" value={form.closesAt} onChange={(event) => updateForm(form.id, { closesAt: event.target.value })} />
                    </label>
                    <label className={fieldLabelClass}>
                      回覆上限
                      <input className={`${inputClass} mt-1`} type="number" min="1" value={form.maxEntries} placeholder="不限" onChange={(event) => updateForm(form.id, { maxEntries: event.target.value })} />
                    </label>
                  </div>
                  <label className="mt-3 flex min-h-11 items-center gap-2 text-[14px] text-slate-900">
                    <input type="checkbox" className="h-4 w-4" checked={form.oneEntryPerIp} onChange={(event) => updateForm(form.id, { oneEntryPerIp: event.target.checked })} />
                    同一個 IP 只可以送出一次
                  </label>
                </section>
              </div>
            )}

            {panel === 'notifications' && (
              <div className="mt-4 grid gap-4 xl:grid-cols-2">
                <section className="rounded-md border border-sky-200 bg-sky-50/50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-[15px] font-semibold text-sky-950">新回覆通知</h3>
                      <p className="mt-1 text-[13px] text-slate-600">客人送出後，寄一封完整回覆給同事。</p>
                    </div>
                    <label className="flex min-h-11 items-center gap-2 text-[14px] text-slate-900">
                      <input type="checkbox" className="h-4 w-4" checked={form.notificationEnabled} onChange={(event) => updateForm(form.id, { notificationEnabled: event.target.checked })} />
                      啟用
                    </label>
                  </div>
                  <div className={`mt-4 space-y-4 ${form.notificationEnabled ? '' : 'opacity-50'}`}>
                    <label className={fieldLabelClass}>
                      收件人電郵（一行一個）
                      <textarea className={`${inputClass} mt-1 min-h-24 py-2`} disabled={!form.notificationEnabled} value={form.notificationRecipientsText} onChange={(event) => updateForm(form.id, { notificationRecipientsText: event.target.value })} />
                    </label>
                    <label className={fieldLabelClass}>
                      Reply-to 用哪個客人電郵欄位
                      <select className={`${inputClass} mt-1`} disabled={!form.notificationEnabled} value={form.notificationReplyToFieldId} onChange={(event) => updateForm(form.id, { notificationReplyToFieldId: event.target.value })}>
                        <option value="">不用 Reply-to</option>
                        {emailFields.map((field) => <option key={field.id} value={field.id}>{field.label}</option>)}
                      </select>
                    </label>
                    <TokenComposer
                      label="電郵主旨"
                      form={form}
                      disabled={!form.notificationEnabled}
                      value={form.notificationSubject}
                      onChange={(value) => updateForm(form.id, { notificationSubject: value })}
                    />
                    <div className="space-y-1">
                      <label className="flex min-h-11 items-center gap-2 text-[14px] text-slate-900"><input type="checkbox" className="h-4 w-4" disabled={!form.notificationEnabled} checked={form.notificationShowEmptyFields} onChange={(event) => updateForm(form.id, { notificationShowEmptyFields: event.target.checked })} />顯示空白欄位</label>
                      <label className="flex min-h-11 items-center gap-2 text-[14px] text-slate-900"><input type="checkbox" className="h-4 w-4" disabled={!form.notificationEnabled} checked={form.notificationIncludeReferrer} onChange={(event) => updateForm(form.id, { notificationIncludeReferrer: event.target.checked })} />有來源頁面時寫入電郵</label>
                      <label className="flex min-h-11 items-center gap-2 text-[14px] text-slate-900"><input type="checkbox" className="h-4 w-4" disabled={!form.notificationEnabled} checked={form.notificationIncludeIp} onChange={(event) => updateForm(form.id, { notificationIncludeIp: event.target.checked })} />包括訪客 IP</label>
                    </div>
                  </div>
                </section>

                <section className="rounded-md border border-violet-200 bg-violet-50/50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-[15px] font-semibold text-violet-950">自動回覆客人</h3>
                      <p className="mt-1 text-[13px] text-slate-600">收到表格後，自動寄確認信給客人。</p>
                    </div>
                    <label className="flex min-h-11 items-center gap-2 text-[14px] text-slate-900">
                      <input type="checkbox" className="h-4 w-4" checked={form.autoresponderEnabled} onChange={(event) => updateForm(form.id, { autoresponderEnabled: event.target.checked })} />
                      啟用
                    </label>
                  </div>
                  <div className={`mt-4 space-y-4 ${form.autoresponderEnabled ? '' : 'opacity-50'}`}>
                    <label className={fieldLabelClass}>
                      寄去哪個電郵欄位
                      <select className={`${inputClass} mt-1`} disabled={!form.autoresponderEnabled} value={form.autoresponderRecipientFieldId} onChange={(event) => updateForm(form.id, { autoresponderRecipientFieldId: event.target.value })}>
                        <option value="">請選擇</option>
                        {emailFields.map((field) => <option key={field.id} value={field.id}>{field.label}</option>)}
                      </select>
                    </label>
                    {emailFields.length === 0 && <p className="text-[13px] text-amber-800">先在「欄位」加入電郵欄位，才可以開自動回覆。</p>}
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className={fieldLabelClass}>寄件人名稱<input className={`${inputClass} mt-1`} disabled={!form.autoresponderEnabled} value={form.autoresponderSenderName} placeholder="例如 Wine Passions" onChange={(event) => updateForm(form.id, { autoresponderSenderName: event.target.value })} /></label>
                      <label className={fieldLabelClass}>客人回覆到<input className={`${inputClass} mt-1`} type="email" disabled={!form.autoresponderEnabled} value={form.autoresponderReplyTo} placeholder="sales@example.com" onChange={(event) => updateForm(form.id, { autoresponderReplyTo: event.target.value })} /></label>
                    </div>
                    <TokenComposer
                      label="電郵主旨"
                      form={form}
                      disabled={!form.autoresponderEnabled}
                      value={form.autoresponderSubject}
                      onChange={(value) => updateForm(form.id, { autoresponderSubject: value })}
                    />
                    <TokenComposer
                      label="電郵內容"
                      form={form}
                      multiline
                      disabled={!form.autoresponderEnabled}
                      value={form.autoresponderMessage}
                      onChange={(value) => updateForm(form.id, { autoresponderMessage: value })}
                    />
                    <label className="flex min-h-11 items-center gap-2 text-[14px] text-slate-900"><input type="checkbox" className="h-4 w-4" disabled={!form.autoresponderEnabled} checked={form.autoresponderIncludeCopy} onChange={(event) => updateForm(form.id, { autoresponderIncludeCopy: event.target.checked })} />附上客人送出的資料副本</label>
                  </div>
                </section>
              </div>
            )}

            {panel === 'asana' && (
              <section className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-[15px] font-semibold text-slate-950">送出後開 Asana task</h3>
                    <p className="mt-1 max-w-2xl text-[13px] leading-5 text-slate-600">
                      這份表格的每份回覆會直接開一條 task。不用再讀電郵，也不用關鍵字。專案、負責人和 collaborator 都在這裡設定。
                    </p>
                  </div>
                  <label className="flex min-h-11 items-center gap-2 text-[14px] text-slate-900">
                    <input type="checkbox" className="h-4 w-4" checked={form.asanaEnabled} onChange={(event) => updateForm(form.id, { asanaEnabled: event.target.checked })} />
                    啟用
                  </label>
                </div>
                {asanaDirectoryError && <p className="mt-3 text-[13px] text-rose-800">未能載入 Asana 名單：{asanaDirectoryError}</p>}
                <div className={`mt-4 space-y-4 ${form.asanaEnabled ? '' : 'opacity-50'}`}>
                  <label className={fieldLabelClass}>
                    專案
                    <select
                      className={`${inputClass} mt-1`}
                      disabled={!form.asanaEnabled}
                      value={form.asanaProjectGid}
                      onChange={(event) => {
                        const project = asanaProjects.find((item) => item.gid === event.target.value);
                        updateForm(form.id, { asanaProjectGid: project?.gid || '', asanaProjectName: project?.name || '' });
                      }}
                    >
                      <option value="">{form.asanaProjectName || '選擇專案'}</option>
                      {asanaProjects.map((project) => <option key={project.gid} value={project.gid}>{project.name}</option>)}
                    </select>
                  </label>
                  <label className={fieldLabelClass}>
                    負責人
                    <select
                      className={`${inputClass} mt-1`}
                      disabled={!form.asanaEnabled}
                      value={form.asanaAssigneeGid}
                      onChange={(event) => {
                        const person = asanaPeople.find((item) => item.gid === event.target.value);
                        updateForm(form.id, {
                          asanaAssigneeGid: person?.gid || '',
                          asanaAssigneeName: person?.name || '',
                          asanaAssigneeEmail: person?.email || '',
                        });
                      }}
                    >
                      <option value="">{form.asanaAssigneeEmail ? `${form.asanaAssigneeEmail}${form.asanaAssigneeName ? `（${form.asanaAssigneeName}）` : ''}` : '選擇負責人'}</option>
                      {asanaPeople.map((person) => (
                        <option key={person.gid} value={person.gid}>{person.email ? `${person.email}（${person.name}）` : person.name}</option>
                      ))}
                    </select>
                  </label>
                  <div>
                    <p className={fieldLabelClass}>額外 collaborator</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {form.asanaCollaboratorGids.map((gid) => {
                        const person = asanaPeople.find((item) => item.gid === gid);
                        return (
                          <button
                            key={gid}
                            type="button"
                            className="inline-flex min-h-9 items-center gap-1 rounded-md border border-slate-300 bg-white px-2 text-[13px] text-slate-900"
                            onClick={() => updateForm(form.id, { asanaCollaboratorGids: form.asanaCollaboratorGids.filter((item) => item !== gid) })}
                          >
                            {person ? (person.name || person.email) : gid} <X size={13} />
                          </button>
                        );
                      })}
                    </div>
                    <select
                      className={`${inputClass} mt-2`}
                      disabled={!form.asanaEnabled}
                      value=""
                      onChange={(event) => {
                        const gid = event.target.value;
                        if (!gid || gid === form.asanaAssigneeGid || form.asanaCollaboratorGids.includes(gid)) return;
                        updateForm(form.id, { asanaCollaboratorGids: [...form.asanaCollaboratorGids, gid] });
                      }}
                    >
                      <option value="">加入 collaborator</option>
                      {asanaPeople.filter((person) => person.gid !== form.asanaAssigneeGid && !form.asanaCollaboratorGids.includes(person.gid)).map((person) => (
                        <option key={person.gid} value={person.gid}>{person.email ? `${person.email}（${person.name}）` : person.name}</option>
                      ))}
                    </select>
                  </div>
                  <TokenComposer
                    label="Task 名稱"
                    form={form}
                    disabled={!form.asanaEnabled}
                    value={form.asanaTaskNameTemplate}
                    onChange={(value) => updateForm(form.id, { asanaTaskNameTemplate: value })}
                  />
                  <p className="text-[13px] leading-5 text-slate-600">回覆內容和上載檔案會放進 task。</p>
                </div>
              </section>
            )}

            {panel === 'links' && (
            <div className="mt-4 space-y-3">
              {form.links.map((link, index) => {
                const publicUrl = inquiryPublicUrl(link.id);
                const replies = submissions.filter((item) => item.link_id === link.id);
                return (
                  <div key={link.id} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-[13px] font-semibold text-slate-800">連結 {index + 1}{replies.length > 0 ? ` · 已收 ${replies.length} 份` : ''}</p>
                      <button
                        type="button"
                        className="inline-flex min-h-11 items-center rounded-md px-2 text-[13px] text-slate-700 hover:bg-white"
                        onClick={() => updateForm(form.id, { links: form.links.filter((item) => item.id !== link.id) })}
                      >
                        移除
                      </button>
                    </div>
                    <p className="mb-1 text-[13px] text-slate-700">放在哪個網站</p>
                    <WebsiteSearch
                      sites={sites}
                      selectedId={link.websiteId}
                      onPick={(site) => updateLink(form.id, link.id, { websiteId: site?.id || '' })}
                    />
                    {sitesLoading && <p className="mt-1 text-[12px] text-slate-500">網站列表載入中…</p>}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <p className="min-w-0 flex-1 break-all text-[13px] text-slate-700">{link.saved ? publicUrl : '儲存後才可以複製這條連結'}</p>
                      {link.saved && (
                        <>
                        <button
                          type="button"
                          className="inline-flex min-h-11 items-center gap-1 rounded-md border border-slate-300 bg-white px-3 text-[13px] text-slate-900 hover:bg-slate-100"
                          onClick={() => {
                            void navigator.clipboard.writeText(publicUrl);
                            toast.success('已複製連結');
                          }}
                        >
                          <Copy size={14} /> 複製
                        </button>
                        <button
                          type="button"
                          className="inline-flex min-h-11 items-center gap-1 rounded-md border border-slate-300 bg-white px-3 text-[13px] text-slate-900 hover:bg-slate-100"
                          onClick={() => {
                            const code = `<iframe src="${publicUrl}" title="${form.name || 'Inquiry form'}" style="width:100%;min-height:720px;border:0" loading="lazy"></iframe>`;
                            void navigator.clipboard.writeText(code);
                            toast.success('已複製嵌入碼');
                          }}
                        >
                          <Code2 size={14} /> 嵌入網站
                        </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
              {form.links.length === 0 && <p className="text-[14px] text-slate-600">未有發佈連結。先加一條，再揀它放在哪個網站。</p>}
              <button
                type="button"
                className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-[14px] text-slate-900 hover:bg-slate-100"
                onClick={() => updateForm(form.id, {
                  links: [...form.links, { id: crypto.randomUUID(), websiteId: '', saved: false }],
                })}
              >
                <Plus size={16} /> 加一條連結
              </button>
            </div>
            )}

            {panel === 'responses' && (
              <div className="mt-4">
                {formReplies.length === 0 ? (
                  <p className="rounded-md border border-slate-200 bg-slate-50 px-4 py-6 text-[14px] text-slate-700">未收到回覆。</p>
                ) : (
                  <div className="mt-2 space-y-2">
                    {formReplies.slice(0, 50).map((item) => {
                      const replyLink = form.links.find((entry) => entry.id === item.link_id);
                      const replySite = sites.find((entry) => entry.id === replyLink?.websiteId);
                      return (
                      <div key={item.id} className="rounded-md border border-slate-200 px-3 py-2 text-[14px] text-slate-800">
                        <p className="text-[12px] text-slate-500">{new Date(item.created_at).toLocaleString('zh-HK', { hour12: false })}</p>
                        <p className="text-[13px] text-slate-700">網站：{replySite ? websiteLabel(replySite) : '未對上網站'}</p>
                        <p className="text-[13px] text-slate-700">來源頁面：{item.referrer || '沒有。瀏覽器沒有提供。'}</p>
                        {(item.answers || []).map((answer, answerIndex) => (
                          <div key={`${item.id}-${answerIndex}`} className="mt-1">
                            <p>{answer.label || '欄位'}：{answerText(answer.value)}</p>
                            {(answer.files || []).map((file) => (
                              <button
                                key={file.path}
                                type="button"
                                disabled={downloadingPath === file.path}
                                className="mt-1 inline-flex min-h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 text-[13px] text-sky-900 hover:bg-sky-50 disabled:opacity-60"
                                onClick={() => void downloadSubmissionFile(file.path, file.name)}
                              >
                                <Download size={14} />
                                {downloadingPath === file.path ? '準備下載…' : `下載 ${file.name}`}
                              </button>
                            ))}
                          </div>
                        ))}
                        {item.asana_task_gid && (
                          <a href={`https://app.asana.com/0/0/${item.asana_task_gid}`} target="_blank" rel="noreferrer" className="mt-2 inline-flex min-h-9 items-center text-[13px] text-sky-900 underline">開啟 Asana task</a>
                        )}
                        {item.asana_error && <p className="mt-2 text-[13px] text-rose-800">Asana：{item.asana_error}</p>}
                        {item.notification_error && <p className="mt-2 text-[13px] text-rose-800">通知電郵失敗：{item.notification_error}</p>}
                        {item.autoresponder_error && <p className="mt-1 text-[13px] text-rose-800">自動回覆失敗：{item.autoresponder_error}</p>}
                      </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            </div>
            </div>
          </article>
          );
        })()}
        {!selectedForm && !loading && (
          <div className="flex min-h-80 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white text-[15px] text-slate-600">
            未有表格
          </div>
        )}
      </div>
    </div>
  );
}
