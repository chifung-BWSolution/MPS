/**
 * 關鍵字 CSV 匯入對話框（M1-16、PRD §6.2.2 配套規則 4）
 *
 * 兩條路徑：貼上 CSV 文字，或選擇 .csv 檔（前端用 File.text() 讀，不上傳）。
 * 欄位（順序即範本順序）：
 *   site,phrase,intent,priority,target_url,notes,cluster,pipeline_status
 *
 * 逐行驗證（單行錯誤不整批失敗；錯誤行不會送出，使用者可修正再送）：
 *   - phrase 空白
 *   - intent / pipeline_status 非法值
 *   - priority 非整數
 *   - 本批重複（正規化後相同）
 *   - 此站已有（只警告，仍會送出，後端會計入 skipped）
 *
 * 資料安全規則（重要）：
 *   匯入是「新詞」唯一會明確寫入 pipeline_status 的地方；且後端對沒有指定
 *   pipeline_status 的列會以 backlog 寫入（＝啟用自動生成）。因此這裡讓使用者
 *   明確選擇「空白 pipeline_status 視為 backlog 或 parked」，並在送出前顯示
 *   實際會寫入的值。歷史詞不會被回填、也不會被 update（後端保證）。
 */

import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileText,
  Info,
  Loader2,
  Upload,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import type {
  ContentKeyword,
  ContentKeywordImportResult,
  ContentKeywordImportRow,
  ContentKeywordIntent,
  ContentKeywordPipelineStatus,
} from '@/lib/contentTypes.ts';
import { KEYWORD_INTENT_LABEL } from '@/lib/contentState.ts';
import {
  KEYWORD_INTENTS,
  KEYWORD_PIPELINE_STATUSES,
  keywordPriorityLabel,
} from '@/hooks/useContentKeywords';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ContentStatusPill } from '../shell/ContentStatusPill';

export const KEYWORD_CSV_TEMPLATE_HREF = '/templates/content-keywords-template.csv';
export const KEYWORD_CSV_MAX_ROWS = 2000;
const PREVIEW_LIMIT = 50;

const CSV_COLUMNS = [
  'site',
  'phrase',
  'intent',
  'priority',
  'target_url',
  'notes',
  'cluster',
  'pipeline_status',
] as const;

type CsvColumn = (typeof CSV_COLUMNS)[number];

const HEADER_ALIASES: Record<string, CsvColumn> = {
  site: 'site',
  phrase: 'phrase',
  keyword: 'phrase',
  '關鍵字': 'phrase',
  intent: 'intent',
  priority: 'priority',
  target_url: 'target_url',
  target_page: 'target_url',
  notes: 'notes',
  note: 'notes',
  cluster: 'cluster',
  pipeline_status: 'pipeline_status',
  status: 'pipeline_status',
};

interface ParsedEntry {
  /** CSV 行號（表頭為第 1 行） */
  line: number;
  phrase: string;
  site: string;
  intent: ContentKeywordIntent | null;
  priority: number | null;
  cluster: string | null;
  targetUrl: string | null;
  notes: string | null;
  pipelineStatus: ContentKeywordPipelineStatus | null;
  /** 阻擋送出的錯誤（該行不會進 payload） */
  errors: string[];
  /** 不阻擋、但送出後會被略過或需要知道的提醒 */
  warnings: string[];
}

interface ParseResult {
  entries: ParsedEntry[];
  /** 表頭／整份檔案層級的錯誤 */
  fatal: string | null;
}

/** 極簡 RFC4180：支援雙引號、跳脫雙引號、逗號、CRLF、BOM */
function splitCsvRows(text: string): string[][] {
  const source = (text || '').replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (inQuotes) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else if (char === '\r') {
      // \r\n 交給 \n 處理；單獨的 \r 也視為換行
      if (source[index + 1] !== '\n') {
        row.push(field);
        field = '';
        rows.push(row);
        row = [];
      }
    } else {
      field += char;
    }
  }
  row.push(field);
  rows.push(row);

  // 去掉完全空白的列（Excel 常留下逗號列）
  return rows.filter((cells) => cells.some((cell) => String(cell).trim() !== ''));
}

function normalizePhrase(value: string): string {
  return value.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
}

function parseKeywordCsv(
  text: string,
  options: {
    existingPhrases: Set<string>;
    defaultPipelineStatus: ContentKeywordPipelineStatus;
  },
): ParseResult {
  const rows = splitCsvRows(text);
  if (rows.length === 0) return { entries: [], fatal: null };

  const headerCells = rows[0].map((cell) =>
    String(cell || '')
      .trim()
      .toLowerCase()
      .replace(/^\uFEFF/, ''),
  );
  const headerIndex = new Map<CsvColumn, number>();
  headerCells.forEach((cell, index) => {
    const column = HEADER_ALIASES[cell];
    if (column && !headerIndex.has(column)) headerIndex.set(column, index);
  });

  if (!headerIndex.has('phrase')) {
    return {
      entries: [],
      fatal:
        '找不到 phrase 欄位。第一列必須是表頭，且至少要有 phrase；範本欄位順序為 site,phrase,intent,priority,target_url,notes,cluster,pipeline_status。',
    };
  }

  const entries: ParsedEntry[] = [];
  const seen = new Map<string, number>();

  for (let index = 1; index < rows.length; index += 1) {
    const cells = rows[index];
    const read = (column: CsvColumn): string => {
      const position = headerIndex.get(column);
      if (position === undefined) return '';
      return String(cells[position] ?? '').trim();
    };

    const phrase = read('phrase');
    const intentText = read('intent').toLowerCase();
    const priorityText = read('priority');
    const pipelineText = read('pipeline_status').toLowerCase();
    const cluster = read('cluster');
    const targetUrl = read('target_url');
    const notes = read('notes');
    const site = read('site');
    const line = index + 1;

    const errors: string[] = [];
    const warnings: string[] = [];

    if (!phrase) errors.push('缺少關鍵字（phrase）');

    let intent: ContentKeywordIntent | null = null;
    if (intentText) {
      if ((KEYWORD_INTENTS as readonly string[]).includes(intentText)) {
        intent = intentText as ContentKeywordIntent;
      } else {
        errors.push(
          `意圖「${intentText}」不合法（可用：${KEYWORD_INTENTS.join(' / ')}，或留空）`,
        );
      }
    }

    let priority: number | null = null;
    if (priorityText) {
      if (/^-?\d+$/.test(priorityText)) {
        priority = Number(priorityText);
      } else {
        errors.push(`優先級「${priorityText}」必須是整數（或留空＝未分級）`);
      }
    }

    let pipelineStatus: ContentKeywordPipelineStatus | null = null;
    if (pipelineText) {
      if ((KEYWORD_PIPELINE_STATUSES as readonly string[]).includes(pipelineText)) {
        pipelineStatus = pipelineText as ContentKeywordPipelineStatus;
      } else {
        errors.push(
          `自動生成狀態「${pipelineText}」不合法（可用：${KEYWORD_PIPELINE_STATUSES.join(' / ')}，或留空）`,
        );
      }
    }

    if (phrase) {
      const normalized = normalizePhrase(phrase);
      const previousLine = seen.get(normalized);
      if (previousLine !== undefined) {
        errors.push(`與第 ${previousLine} 行重複（正規化後相同）`);
      } else {
        seen.set(normalized, line);
        if (options.existingPhrases.has(normalized)) {
          warnings.push('此站已有相同關鍵字，送出後會被略過（不會覆蓋既有資料）');
        }
      }
    }

    entries.push({
      line,
      phrase,
      site,
      intent,
      priority,
      cluster: cluster || null,
      targetUrl: targetUrl || null,
      notes: notes || null,
      pipelineStatus: pipelineStatus ?? options.defaultPipelineStatus,
      errors,
      warnings,
    });
  }

  return { entries, fatal: null };
}

export interface KeywordImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  siteId: string | null;
  siteName?: string | null;
  /** useContentKeywords().importRows */
  onImport: (rows: ContentKeywordImportRow[]) => Promise<ContentKeywordImportResult>;
  /** 目前站點既有關鍵字（只做「已存在」提醒，不阻擋送出） */
  existingKeywords?: ContentKeyword[];
  onImported?: (result: ContentKeywordImportResult) => void;
}

export function KeywordImportDialog({
  open,
  onOpenChange,
  siteId,
  siteName,
  onImport,
  existingKeywords = [],
  onImported,
}: KeywordImportDialogProps) {
  const [draft, setDraft] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [defaultPipelineStatus, setDefaultPipelineStatus] =
    useState<ContentKeywordPipelineStatus>('backlog');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ContentKeywordImportResult | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<'preview' | 'errors'>('preview');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const existingPhrases = useMemo(() => {
    const set = new Set<string>();
    for (const keyword of existingKeywords) {
      const normalized = keyword.normalized_keyword || normalizePhrase(keyword.keyword);
      if (normalized) set.add(normalizePhrase(normalized));
    }
    return set;
  }, [existingKeywords]);

  const parsed = useMemo(
    () => parseKeywordCsv(draft, { existingPhrases, defaultPipelineStatus }),
    [defaultPipelineStatus, draft, existingPhrases],
  );

  const invalidEntries = useMemo(
    () => parsed.entries.filter((entry) => entry.errors.length > 0),
    [parsed.entries],
  );
  const validEntries = useMemo(
    () => parsed.entries.filter((entry) => entry.errors.length === 0),
    [parsed.entries],
  );
  const warningEntries = useMemo(
    () => validEntries.filter((entry) => entry.warnings.length > 0),
    [validEntries],
  );

  const payload = useMemo<ContentKeywordImportRow[]>(
    () =>
      validEntries.map((entry) => ({
        phrase: entry.phrase,
        intent: entry.intent,
        priority: entry.priority,
        cluster: entry.cluster,
        target_url: entry.targetUrl,
        notes: entry.notes,
        pipeline_status: entry.pipelineStatus,
      })),
    [validEntries],
  );

  const tooManyRows = payload.length > KEYWORD_CSV_MAX_ROWS;

  const resetSubmitState = () => {
    setResult(null);
    setSubmitError(null);
  };

  const handlePickFile = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('檔案超過 5 MB，請改用貼上或分批匯入。');
      return;
    }
    try {
      const text = await file.text();
      setDraft(text);
      setFileName(file.name);
      resetSubmitState();
      setExpanded('preview');
    } catch (caught) {
      toast.error(`讀取檔案失敗：${caught instanceof Error ? caught.message : String(caught)}`);
    }
  };

  const handleSubmit = async () => {
    if (!siteId) {
      toast.error('請先選擇站點。');
      return;
    }
    if (parsed.fatal || payload.length === 0) return;
    if (tooManyRows) {
      toast.error(`單次最多匯入 ${KEYWORD_CSV_MAX_ROWS} 行，請分批送出。`);
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    setResult(null);
    try {
      const imported = await onImport(payload);
      setResult(imported);

      const failed = Array.isArray(imported.errors) ? imported.errors.length : 0;
      if (failed === 0 && imported.inserted > 0) {
        toast.success(
          `已匯入 ${imported.inserted} 個關鍵字${imported.skipped > 0 ? `；略過 ${imported.skipped} 個重複` : ''}`,
        );
      } else if (imported.inserted > 0) {
        toast.warning(
          `部分成功：新增 ${imported.inserted} 個、略過 ${imported.skipped} 個、${failed} 行有錯誤`,
        );
      } else if (imported.skipped > 0 && failed === 0) {
        toast.info(`沒有新增；${imported.skipped} 個關鍵字已存在（不會覆蓋既有資料）`);
      } else {
        toast.error('沒有匯入任何關鍵字，請查看錯誤清單。');
      }

      if (failed > 0) setExpanded('errors');

      onImported?.(imported);

      // 全部成功才清空；有任何錯誤就保留輸入，讓使用者修正後再送
      if (imported.inserted > 0 && failed === 0 && imported.skipped === 0) {
        setDraft('');
        setFileName(null);
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setSubmitError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = (next: boolean) => {
    if (submitting) return;
    if (!next) {
      resetSubmitState();
      setExpanded('preview');
      setFileName(null);
    }
    onOpenChange(next);
  };

  /** 後端回報的 line 是「送出陣列的第 N 筆」，換算回 CSV 行號 */
  const lineOfPayloadIndex = (payloadIndex: number): number | null => {
    const entry = validEntries[payloadIndex - 1];
    return entry ? entry.line : null;
  };

  const previewEntries = parsed.entries.slice(0, PREVIEW_LIMIT);
  const issueTotal = invalidEntries.length + (result?.errors?.length ?? 0);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>匯入關鍵字 CSV</DialogTitle>
          <DialogDescription>
            {siteName ? `站點：${siteName}｜` : ''}
            貼上 CSV 或選擇檔案；逐行驗證，錯誤的行不會送出，修正後可再送一次。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* 資料安全說明 */}
          <div className="flex gap-2 rounded-md border border-blue-200 bg-blue-50/70 px-3 py-2 text-[12px] leading-relaxed text-blue-900">
            <Info size={14} className="mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p>
                匯入只會<strong>新增</strong>關鍵字，不會修改既有詞（歷史資料的
                pipeline_status 一律保持 NULL，不會被回填）。
              </p>
              <p>
                自動生成狀態空白時，預設以你下方選擇的值寫入；只有{' '}
                <span className="font-mono">backlog</span> 的詞會被 planner 挑去生成文章。
              </p>
            </div>
          </div>

          {/* 輸入區 */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-[12px] font-semibold text-[#0d1a2d]" htmlFor="keyword-csv-input">
                步驟 1：貼上 CSV 內容或選擇檔案
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(event) => void handleFileChange(event)}
                />
                <Button type="button" variant="outline" size="sm" onClick={handlePickFile}>
                  <Upload size={13} />
                  選擇 CSV 檔
                </Button>
                <a
                  href={KEYWORD_CSV_TEMPLATE_HREF}
                  download
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[rgba(13,26,45,0.12)] bg-white px-3 text-[12px] font-medium text-slate-700 transition-colors hover:bg-slate-50"
                >
                  <Download size={13} />
                  下載範本
                </a>
              </div>
            </div>

            <Textarea
              id="keyword-csv-input"
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                setFileName(null);
                resetSubmitState();
              }}
              rows={7}
              placeholder={`${CSV_COLUMNS.join(',')}\n,室內設計公司推薦,commercial,1000,,首頁主打詞,室內設計,backlog`}
              className="min-h-[132px] font-mono text-[12px] leading-relaxed"
              spellCheck={false}
            />

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-muted-foreground">
              {fileName && (
                <span className="inline-flex items-center gap-1 text-slate-600">
                  <FileText size={12} />
                  {fileName}
                </span>
              )}
              <label className="inline-flex items-center gap-2">
                <span>空白 pipeline_status 視為：</span>
                <Select
                  value={defaultPipelineStatus}
                  onValueChange={(value) => {
                    setDefaultPipelineStatus(value as ContentKeywordPipelineStatus);
                    resetSubmitState();
                  }}
                >
                  <SelectTrigger className="h-7 w-[210px] text-[11px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="backlog" className="text-[12px]">
                      backlog（啟用自動生成）
                    </SelectItem>
                    <SelectItem value="parked" className="text-[12px]">
                      parked（暫緩，不啟用）
                    </SelectItem>
                  </SelectContent>
                </Select>
              </label>
              <span>
                欄位：<span className="font-mono text-slate-500">{CSV_COLUMNS.join(',')}</span>
              </span>
              <span className="text-slate-500">
                site 欄位僅供辨識，實際匯入站點以頁面上方選定的站點為準。
              </span>
              <span className="text-slate-500">
                notes 欄位目前沒有對應的資料庫欄位，僅供你留存參考、不會入庫。
              </span>
            </div>
          </div>

          {/* 解析結果摘要 */}
          <div className="rounded-md border border-[rgba(13,26,45,0.08)] bg-slate-50/60">
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
                <span>
                  解析 <strong className="tabular-nums">{parsed.entries.length}</strong> 個資料列
                </span>
                <span className="inline-flex items-center gap-1 text-teal-700">
                  <CheckCircle2 size={12} />
                  可送出 <strong className="tabular-nums">{payload.length}</strong>
                </span>
                <span
                  className={cn(
                    'inline-flex items-center gap-1',
                    invalidEntries.length > 0 ? 'text-rose-600' : 'text-muted-foreground',
                  )}
                >
                  <XCircle size={12} />
                  無法送出 <strong className="tabular-nums">{invalidEntries.length}</strong>
                </span>
                {warningEntries.length > 0 && (
                  <span className="inline-flex items-center gap-1 text-amber-700">
                    <AlertTriangle size={12} />
                    已存在 <strong className="tabular-nums">{warningEntries.length}</strong>
                  </span>
                )}
                {tooManyRows && (
                  <span className="text-rose-600">
                    超過單次上限 {KEYWORD_CSV_MAX_ROWS} 行
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant={expanded === 'preview' ? 'secondary' : 'ghost'}
                  className="h-7 text-[12px]"
                  onClick={() => setExpanded('preview')}
                >
                  預覽
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={expanded === 'errors' ? 'secondary' : 'ghost'}
                  className={cn('h-7 text-[12px]', issueTotal > 0 && 'text-rose-600')}
                  onClick={() => setExpanded('errors')}
                >
                  錯誤清單{issueTotal > 0 ? `（${issueTotal}）` : ''}
                </Button>
              </div>
            </div>

            {expanded === 'preview' ? (
              <div className="max-h-[260px] overflow-auto border-t border-[rgba(13,26,45,0.08)] bg-white">
                {parsed.fatal ? (
                  <p className="px-3 py-4 text-[12px] text-rose-600">{parsed.fatal}</p>
                ) : previewEntries.length === 0 ? (
                  <p className="px-3 py-4 text-[12px] text-muted-foreground">
                    貼上內容後會在這裡顯示前 {PREVIEW_LIMIT} 列的預覽。
                  </p>
                ) : (
                  <table className="w-full text-[12px]">
                    <thead className="sticky top-0 bg-slate-50 text-[11px] text-slate-500">
                      <tr>
                        <th className="px-3 py-1.5 text-left font-medium">行號</th>
                        <th className="px-3 py-1.5 text-left font-medium">關鍵字</th>
                        <th className="px-3 py-1.5 text-left font-medium">意圖</th>
                        <th className="px-3 py-1.5 text-left font-medium">優先級</th>
                        <th className="px-3 py-1.5 text-left font-medium">叢集</th>
                        <th className="px-3 py-1.5 text-left font-medium">自動生成狀態</th>
                        <th className="px-3 py-1.5 text-left font-medium">問題</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewEntries.map((entry) => (
                        <tr
                          key={`preview-${entry.line}`}
                          className={cn(
                            'border-t border-slate-100',
                            entry.errors.length > 0 && 'bg-rose-50/60',
                          )}
                        >
                          <td className="px-3 py-1.5 font-mono text-[11px] text-slate-400">
                            {entry.line}
                          </td>
                          <td className="max-w-[220px] truncate px-3 py-1.5">
                            {entry.phrase || <span className="text-rose-500">（空白）</span>}
                            {entry.site && (
                              <span className="ml-1 text-[10px] text-slate-400">
                                site: {entry.site}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-1.5 text-slate-600">
                            {entry.intent ? KEYWORD_INTENT_LABEL[entry.intent] : '—'}
                          </td>
                          <td className="px-3 py-1.5 text-slate-600">
                            {keywordPriorityLabel(entry.priority)}
                          </td>
                          <td className="max-w-[120px] truncate px-3 py-1.5 text-slate-600">
                            {entry.cluster || '—'}
                          </td>
                          <td className="px-3 py-1.5">
                            <ContentStatusPill
                              machine="keyword"
                              status={entry.pipelineStatus}
                            />
                            <span className="ml-1 font-mono text-[10px] text-slate-400">
                              {entry.pipelineStatus}
                            </span>
                          </td>
                          <td className="px-3 py-1.5">
                            {entry.errors.length > 0 ? (
                              <span className="text-rose-600">{entry.errors.join('；')}</span>
                            ) : entry.warnings.length > 0 ? (
                              <span className="text-amber-700">{entry.warnings.join('；')}</span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {parsed.entries.length > PREVIEW_LIMIT && (
                  <p className="border-t border-slate-100 px-3 py-1.5 text-[11px] text-muted-foreground">
                    僅顯示前 {PREVIEW_LIMIT} 列，其餘 {parsed.entries.length - PREVIEW_LIMIT} 列仍會驗證並送出。
                  </p>
                )}
              </div>
            ) : (
              <div className="max-h-[260px] space-y-1.5 overflow-auto border-t border-[rgba(13,26,45,0.08)] bg-white px-3 py-2">
                {invalidEntries.length === 0 && !submitError ? (
                  <p className="py-2 text-[12px] text-muted-foreground">
                    目前沒有驗證錯誤。{warningEntries.length > 0 ? '黃色提醒的行送出後會被略過。' : ''}
                  </p>
                ) : (
                  invalidEntries.map((entry) => (
                    <p key={`issue-${entry.line}`} className="text-[12px] leading-relaxed">
                      <span className="font-mono text-slate-400">第 {entry.line} 行</span>
                      {entry.phrase ? (
                        <span className="mx-1.5 text-slate-700">「{entry.phrase}」</span>
                      ) : null}
                      <span className="text-rose-600">{entry.errors.join('；')}</span>
                    </p>
                  ))
                )}

                {/* 後端逐行錯誤（line 為送出陣列序號，換算回 CSV 行號） */}
                {result && result.errors.length > 0 && (
                  <div className="mt-2 border-t border-slate-100 pt-2">
                    <p className="mb-1 text-[11px] font-semibold text-rose-600">
                      後端回報 {result.errors.length} 行錯誤：
                    </p>
                    {result.errors.map((error, index) => (
                      <p key={`server-issue-${index}`} className="text-[12px] leading-relaxed">
                        <span className="font-mono text-slate-400">
                          第 {lineOfPayloadIndex(error.line) ?? error.line} 行
                        </span>
                        {error.phrase ? (
                          <span className="mx-1.5 text-slate-700">「{error.phrase}」</span>
                        ) : null}
                        <span className="text-rose-600">{error.reason}</span>
                      </p>
                    ))}
                  </div>
                )}
                {submitError && (
                  <p className="mt-2 border-t border-slate-100 pt-2 text-[12px] text-rose-600">
                    {submitError}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* 匯入結果 */}
          {result && (
            <div
              className={cn(
                'rounded-md border px-3 py-2 text-[12px] leading-relaxed',
                result.errors.length > 0
                  ? 'border-amber-200 bg-amber-50 text-amber-900'
                  : 'border-teal-200 bg-teal-50 text-teal-900',
              )}
            >
              <p className="font-semibold">匯入結果</p>
              <p className="mt-0.5">
                新增 <strong className="tabular-nums">{result.inserted}</strong> 個 · 略過{' '}
                <strong className="tabular-nums">{result.skipped}</strong> 個（重複或已存在） · 錯誤{' '}
                <strong className="tabular-nums">{result.errors.length}</strong> 行
              </p>
              {result.errors.length > 0 && (
                <p className="mt-1">
                  有 {result.errors.length} 行未被接受，已在「錯誤清單」列出；已接受的{' '}
                  {result.inserted} 個關鍵字已入庫，修正錯誤行後可只重送那幾行。
                </p>
              )}
              {result.inserted === 0 && result.skipped > 0 && result.errors.length === 0 && (
                <p className="mt-1">這些關鍵字此站已經有了，匯入不會覆蓋既有資料。</p>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <a
            href={KEYWORD_CSV_TEMPLATE_HREF}
            download
            className="mr-auto inline-flex h-8 items-center gap-1.5 text-[12px] font-medium text-teal-700 hover:underline"
          >
            <Download size={13} />
            下載 CSV 範本
          </a>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => handleClose(false)}
            disabled={submitting}
          >
            取消
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => void handleSubmit()}
            disabled={
              submitting ||
              !siteId ||
              Boolean(parsed.fatal) ||
              payload.length === 0 ||
              tooManyRows
            }
          >
            {submitting ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
            送出 {payload.length} 個關鍵字
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
