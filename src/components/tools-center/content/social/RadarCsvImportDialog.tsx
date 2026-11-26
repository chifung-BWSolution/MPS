import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import type { SocialEventImportRow, SocialImportResult } from '@/hooks/useSocialWorkspace.ts';

interface RadarCsvImportDialogProps {
  open: boolean;
  onClose: () => void;
  onImport: (rows: readonly SocialEventImportRow[]) => Promise<SocialImportResult>;
}

const MAX_ROWS = 200;

const SAMPLE = `title,url,summary
秋冬乾肌保養攻略,https://example.com/autumn-dry-skin,轉季時潔面與精華要跟著濕度調整
敏感肌怎樣選潔面,,洗完繃緊代表屏障被洗走`;

interface ParsedRow {
  line: number;
  title: string;
  url: string | null;
  summary: string | null;
  error: string | null;
}

/** 解析 CSV（支援引號、逗號、CRLF、BOM；第一列可為表頭） */
export function parseCsvRows(raw: string): ParsedRow[] {
  const text = raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const rows: ParsedRow[] = [];
  let field = '';
  let fields: string[] = [];
  let inQuotes = false;
  const pushRow = () => {
    fields.push(field);
    const cells = fields.map((cell) => cell.trim());
    fields = [];
    field = '';
    if (cells.every((cell) => cell === '')) return;
    rows.push({ line: rows.length + 1, title: cells[0] ?? '', url: cells[1] ?? '', summary: cells[2] ?? '', error: null } as unknown as ParsedRow);
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (inQuotes && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === ',' && !inQuotes) {
      fields.push(field);
      field = '';
      continue;
    }
    if (char === '\n' && !inQuotes) {
      pushRow();
      continue;
    }
    field += char;
  }
  pushRow();

  // 表頭
  if (rows.length > 0 && /title|標題/i.test(rows[0].title) && rows[0].title.length < 20) {
    rows.shift();
  }

  return rows.map((row, index) => {
    const title = String(row.title ?? '').trim();
    const url = String(row.url ?? '').trim();
    const summary = String(row.summary ?? '').trim();
    let error: string | null = null;
    if (title.length < 2) error = '標題至少 2 個字';
    else if (title.length > 120) error = '標題不可超過 120 字';
    else if (url && !/^https?:\/\//i.test(url)) error = '連結必須是 http(s)';
    return {
      line: index + 1,
      title,
      url: url || null,
      summary: summary || null,
      error,
    };
  });
}

export function RadarCsvImportDialog({ open, onClose, onImport }: RadarCsvImportDialogProps) {
  const [raw, setRaw] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SocialImportResult | null>(null);

  const rows = useMemo(() => parseCsvRows(raw), [raw]);
  const validRows = rows.filter((row) => !row.error);
  const invalidRows = rows.filter((row) => row.error);

  const handleImport = async () => {
    if (validRows.length === 0) {
      toast.error('沒有可匯入的資料列');
      return;
    }
    setSubmitting(true);
    try {
      const outcome = await onImport(
        validRows.slice(0, MAX_ROWS).map((row) => ({
          title: row.title,
          url: row.url,
          summary: row.summary,
        })),
      );
      setResult(outcome);
      toast.success(`已匯入 ${outcome.inserted} 則，跳過 ${outcome.skipped} 則`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '匯入失敗');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : undefined)}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>匯入熱點 CSV</DialogTitle>
          <DialogDescription>
            欄位：title,url,summary（第一列可以是表頭）。最多 {MAX_ROWS} 列；重複標題／連結會自動跳過。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Textarea
            value={raw}
            onChange={(event) => {
              setRaw(event.target.value);
              setResult(null);
            }}
            placeholder={SAMPLE}
            className="min-h-[180px] font-mono text-[12px]"
          />
          <div className="flex flex-wrap items-center gap-2 text-[11.5px] text-muted-foreground">
            <button
              type="button"
              className="text-teal-700 underline-offset-2 hover:underline"
              onClick={() => setRaw(SAMPLE)}
            >
              填入範例
            </button>
            <span>·</span>
            <label className="cursor-pointer text-teal-700 underline-offset-2 hover:underline">
              選擇 CSV 檔
              <input
                type="file"
                accept=".csv,text/csv,text/plain"
                className="hidden"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  setRaw(await file.text());
                  setResult(null);
                  event.target.value = '';
                }}
              />
            </label>
            {raw ? (
              <>
                <span>·</span>
                <button
                  type="button"
                  className="text-slate-600 underline-offset-2 hover:underline"
                  onClick={() => {
                    setRaw('');
                    setResult(null);
                  }}
                >
                  清空
                </button>
              </>
            ) : null}
          </div>

          {rows.length > 0 && (
            <div className="max-h-[240px] overflow-auto rounded-md border border-[rgba(13,26,45,0.08)]">
              <table className="w-full text-[11.5px]">
                <thead className="sticky top-0 bg-slate-50 text-left text-slate-500">
                  <tr>
                    <th className="px-2 py-1">#</th>
                    <th className="px-2 py-1">標題</th>
                    <th className="px-2 py-1">連結</th>
                    <th className="px-2 py-1">摘要</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 50).map((row) => (
                    <tr
                      key={`${row.line}-${row.title}`}
                      className={cnRow(row.error)}
                    >
                      <td className="px-2 py-1 text-slate-400">{row.line}</td>
                      <td className="px-2 py-1">{row.title || '（空白）'}</td>
                      <td className="max-w-[220px] truncate px-2 py-1 text-slate-500">
                        {row.url || '—'}
                      </td>
                      <td className="px-2 py-1 text-slate-500">
                        {row.error ? <span className="text-rose-600">{row.error}</span> : row.summary || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {rows.length > 0 && (
            <p className="text-[11.5px] text-muted-foreground">
              可匯入 {validRows.length} 列
              {invalidRows.length > 0 ? `；${invalidRows.length} 列有錯誤（不影響其他列）` : ''}
            </p>
          )}

          {result && (
            <div className="rounded-md border border-teal-200 bg-teal-50/60 px-3 py-2 text-[11.5px] text-teal-800">
              完成：新增 {result.inserted}、跳過 {result.skipped}
              {result.errors.length > 0 ? `、${result.errors.length} 列失敗` : ''}
              {result.errors.length > 0 && (
                <ul className="mt-1 space-y-0.5 text-rose-700">
                  {result.errors.slice(0, 5).map((item) => (
                    <li key={`${item.line}-${item.title}`}>
                      第 {item.line} 列：{item.reason}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            關閉
          </Button>
          <Button onClick={() => void handleImport()} disabled={submitting || validRows.length === 0}>
            {submitting ? '匯入中…' : `匯入 ${validRows.length} 列`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function cnRow(error: string | null): string {
  return error ? 'border-t border-rose-100 bg-rose-50/40' : 'border-t border-slate-100';
}
