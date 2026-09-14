import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CrudModal, CrudModalFooter } from '@/components/ui/crud-modal';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { sendEmail } from '@/lib/resendApi';
import {
  ADS_EMAIL_ALERT_THRESHOLD,
  alertToneClass,
  brandDisplayLabel,
  buildAlertEmailHtml,
  buildAlertEmailSubject,
  formatPercentChange,
  htmlToPlainText,
  defaultAlertStaffIds,
  selectedAlertBrands,
  wrapAlertEmailHtml,
  type AdsEmailAlertBrandSnapshot,
  type AdsEmailAlertStaff,
} from '@/lib/adsEmailAlert';
import { formatClickTrendValue, UNASSIGNED_BRAND_ID } from '@/lib/adsCostTrend';
import { AdsEmailAlertEditor } from './AdsEmailAlertEditor';
import { cn } from '@/lib/utils';

export function AdsEmailAlertDialog({
  open,
  onClose,
  flagged,
  period,
  asOf,
  staff,
  staffLoading,
  resendConfigured,
}: {
  open: boolean;
  onClose: () => void;
  flagged: AdsEmailAlertBrandSnapshot[];
  period: { current: string; previous: string; currentRange: string; previousRange: string };
  asOf: string;
  staff: AdsEmailAlertStaff[];
  staffLoading: boolean;
  resendConfigured: boolean;
}) {
  const [selectedBrandIds, setSelectedBrandIds] = useState<string[]>([]);
  const [selectedStaff, setSelectedStaff] = useState<Set<string>>(new Set());
  const [subjectDraft, setSubjectDraft] = useState('');
  const [htmlDraft, setHtmlDraft] = useState('');
  const [subjectDirty, setSubjectDirty] = useState(false);
  const [htmlDirty, setHtmlDirty] = useState(false);
  const [sending, setSending] = useState(false);
  const [staffQuery, setStaffQuery] = useState('');
  const [seededKey, setSeededKey] = useState<string | null>(null);
  const [staffSeeded, setStaffSeeded] = useState(false);
  const flaggedKey = flagged.map((row) => row.brandId).join(',');
  const defaultStaffIds = useMemo(() => defaultAlertStaffIds(staff), [staff]);

  if (open && seededKey == null) {
    setSeededKey(flaggedKey);
    setSelectedBrandIds(flagged.map((row) => row.brandId));
    setSelectedStaff(new Set(defaultStaffIds));
    setStaffSeeded(staff.length > 0);
    setStaffQuery('');
    setSubjectDirty(false);
    setHtmlDirty(false);
  } else if (open && seededKey === '' && flaggedKey !== '') {
    setSeededKey(flaggedKey);
    setSelectedBrandIds(flagged.map((row) => row.brandId));
    setSubjectDirty(false);
    setHtmlDirty(false);
  } else if (open && !staffSeeded && staff.length > 0) {
    setSelectedStaff(new Set(defaultStaffIds));
    setStaffSeeded(true);
  } else if (!open && seededKey != null) {
    setSeededKey(null);
    setStaffSeeded(false);
  }

  const includedBrands = useMemo(
    () => selectedAlertBrands(flagged, selectedBrandIds),
    [flagged, selectedBrandIds],
  );

  const generatedSubject = useMemo(
    () => buildAlertEmailSubject(includedBrands, period),
    [includedBrands, period.current, period.previous],
  );
  const generatedHtml = useMemo(
    () => buildAlertEmailHtml({ flagged: includedBrands, period, asOf }),
    [includedBrands, period.current, period.previous, period.currentRange, period.previousRange, asOf],
  );

  const subject = subjectDirty ? subjectDraft : generatedSubject;
  const html = htmlDirty ? htmlDraft : generatedHtml;

  const visibleStaff = useMemo(() => {
    const q = staffQuery.trim().toLowerCase();
    if (!q) return staff;
    return staff.filter(
      (row) => row.name.toLowerCase().includes(q) || row.email.toLowerCase().includes(q),
    );
  }, [staff, staffQuery]);

  const selectedRecipients = useMemo(
    () => staff.filter((row) => selectedStaff.has(row.id)),
    [staff, selectedStaff],
  );
  const selectedEmails = useMemo(
    () => selectedRecipients.map((row) => row.email),
    [selectedRecipients],
  );
  const selectedStaffNames = useMemo(
    () => selectedRecipients.map((row) => row.name).filter(Boolean),
    [selectedRecipients],
  );

  const toggleStaff = (id: string) => {
    setSelectedStaff((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleBrand = (id: string) => {
    setSelectedBrandIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
    setSubjectDirty(false);
    setHtmlDirty(false);
  };

  const handleSend = async () => {
    if (!resendConfigured) {
      toast.error('尚未設定 Resend API key');
      return;
    }
    if (selectedEmails.length === 0) {
      toast.error('請選擇至少一位同事');
      return;
    }
    const nextSubject = subject.trim();
    const nextHtml = html.trim();
    if (!nextSubject || !nextHtml) {
      toast.error('主旨與內容不能空白');
      return;
    }
    setSending(true);
    try {
      const result = await sendEmail({
        to: selectedEmails,
        subject: nextSubject,
        html: wrapAlertEmailHtml(nextHtml),
        text: htmlToPlainText(nextHtml),
        idempotencyKey: `ads-email-alert/${crypto.randomUUID()}`,
      });
      toast.success(`已發送電郵預警（${result.id || 'ok'}）`);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <CrudModal
      isOpen={open}
      onClose={() => !sending && onClose()}
      title="發送電郵預警"
      size="2xl"
    >
      <div className="space-y-5">
        <p className="text-[13px] text-muted-foreground">
          預設帶入 CPC 或 CPA 較{period.previous}上升超過 {ADS_EMAIL_ALERT_THRESHOLD}% 的品牌（含未設定品牌）。勾選或取消品牌會即時更新主旨與報告內容。
        </p>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[12px] font-medium">預警品牌</div>
            <div className="text-[11px] text-muted-foreground">
              已選 {includedBrands.length} / {flagged.length} 個
            </div>
          </div>
          {flagged.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">
              目前沒有 CPC 或 CPA 上升超過 {ADS_EMAIL_ALERT_THRESHOLD}% 的品牌。
            </p>
          ) : (
            <div className="space-y-1.5 max-h-[320px] overflow-y-auto pr-1">
              {flagged.map((row) => {
                const checked = selectedBrandIds.includes(row.brandId);
                return (
                  <div
                    key={row.brandId}
                    role="button"
                    tabIndex={0}
                    onClick={() => toggleBrand(row.brandId)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggleBrand(row.brandId);
                      }
                    }}
                    className={cn(
                      'flex items-start gap-2.5 rounded-md border px-2.5 py-2 cursor-pointer transition-colors',
                      checked ? 'border-teal-200 bg-teal-50/60' : 'border-border hover:bg-muted/40',
                    )}
                  >
                    <Checkbox checked={checked} disabled={sending} className="mt-0.5 pointer-events-none" />
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium">
                        {brandDisplayLabel(row)}
                        {row.brandId === UNASSIGNED_BRAND_ID ? (
                          <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">（未歸屬品牌）</span>
                        ) : null}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        CPC {formatClickTrendValue(row.cells.cpc.current, 'cpc')}
                        <span className={cn('ml-1 font-semibold', alertToneClass(row.cells.cpc.tone))}>
                          {formatPercentChange(row.cells.cpc.percent)}
                        </span>
                        {' · '}
                        CPA {formatClickTrendValue(row.cells.cpa.current, 'cpa')}
                        <span className={cn('ml-1 font-semibold', alertToneClass(row.cells.cpa.tone))}>
                          {formatPercentChange(row.cells.cpa.percent)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="text-[12px] font-medium shrink-0">收件同事</div>
            <div className="text-[11px] text-muted-foreground text-right leading-5">
              {selectedStaffNames.length > 0 ? selectedStaffNames.join('、') : '尚未選擇'}
            </div>
          </div>
          <Input
            value={staffQuery}
            onChange={(e) => setStaffQuery(e.target.value)}
            placeholder="搜尋同事姓名或電郵…"
            className="h-9 text-[13px]"
          />
          {staffLoading ? (
            <p className="text-[13px] text-muted-foreground">載入同事名單…</p>
          ) : visibleStaff.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">沒有可寄送的同事電郵。請確認職員已填寫工作電郵。</p>
          ) : (
            <div className="space-y-1.5 max-h-[200px] overflow-y-auto pr-1">
              {visibleStaff.map((row) => {
                const checked = selectedStaff.has(row.id);
                return (
                  <div
                    key={row.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => toggleStaff(row.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggleStaff(row.id);
                      }
                    }}
                    className={cn(
                      'flex items-center gap-2.5 rounded-md border px-2.5 py-2 cursor-pointer transition-colors',
                      checked ? 'border-teal-200 bg-teal-50/60' : 'border-border hover:bg-muted/40',
                    )}
                  >
                    <Checkbox checked={checked} disabled={sending} className="pointer-events-none" />
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium truncate">{row.name}</div>
                      <div className="text-[11px] text-muted-foreground truncate">{row.email}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="text-[12px] font-medium">主旨</div>
          <Input
            value={subject}
            onChange={(e) => {
              setSubjectDirty(true);
              setSubjectDraft(e.target.value);
            }}
            className="h-9 text-[13px]"
            disabled={sending}
          />
        </div>

        <div className="space-y-2">
          <div className="text-[12px] font-medium">報告內容</div>
          <AdsEmailAlertEditor
            html={html}
            disabled={sending}
            onHtmlChange={(next) => {
              if (next === generatedHtml) {
                setHtmlDirty(false);
                return;
              }
              setHtmlDirty(true);
              setHtmlDraft(next);
            }}
          />
        </div>
      </div>

      <CrudModalFooter>
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] text-muted-foreground">
            {resendConfigured ? `將寄給 ${selectedEmails.length} 位同事` : '尚未設定 Resend'}
            {` · 含 ${includedBrands.length} 個品牌`}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={sending}>
              取消
            </Button>
            <Button size="sm" onClick={() => void handleSend()} disabled={sending || selectedEmails.length === 0}>
              {sending ? '發送中…' : '發送'}
            </Button>
          </div>
        </div>
      </CrudModalFooter>
    </CrudModal>
  );
}
