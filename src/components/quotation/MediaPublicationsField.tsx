import { useEffect, useRef, useState } from 'react';
import { ExternalLink, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  mediaPublicationRowsHaveInvalidUrl,
  mediaPublicationsEqual,
  mediaPublicationsForWrite,
  newMediaPublicationId,
  normalizeMediaPublicationUrl,
  type MediaPublication,
} from '@/lib/mediaPublications';

function rowsFromValue(value: readonly MediaPublication[]): MediaPublication[] {
  if (value.length === 0) return [{ id: newMediaPublicationId(), url: '' }];
  return value.map((row) => ({ id: row.id, url: row.url }));
}

export function MediaPublicationsField({
  value,
  onCommit,
  disabled = false,
}: {
  value: readonly MediaPublication[];
  onCommit: (next: MediaPublication[]) => void;
  disabled?: boolean;
}) {
  const [rows, setRows] = useState<MediaPublication[]>(() => rowsFromValue(value));
  const [focusId, setFocusId] = useState<string | null>(null);
  const rowsRef = useRef(rows);
  const valueKey = JSON.stringify(value);

  const setRowState = (next: MediaPublication[] | ((current: MediaPublication[]) => MediaPublication[])) => {
    setRows((current) => {
      const resolved = typeof next === 'function' ? next(current) : next;
      rowsRef.current = resolved;
      return resolved;
    });
  };

  useEffect(() => {
    setRowState((current) => {
      if (mediaPublicationsEqual(mediaPublicationsForWrite(current), value)) return current;
      return rowsFromValue(value);
    });
    // valueKey tracks content; `value` is read from this render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valueKey]);

  useEffect(() => {
    if (!focusId) return;
    document.getElementById(`media-publication-${focusId}`)?.focus();
    setFocusId(null);
  }, [focusId]);

  const commit = (nextRows: MediaPublication[]) => {
    if (mediaPublicationRowsHaveInvalidUrl(nextRows)) {
      toast.error('請輸入有效的網址');
      return;
    }
    onCommit(mediaPublicationsForWrite(nextRows));
  };

  const updateUrl = (id: string, url: string) => {
    setRowState((current) => current.map((row) => (row.id === id ? { ...row, url } : row)));
  };

  const addRow = () => {
    const id = newMediaPublicationId();
    setRowState((current) => [...current, { id, url: '' }]);
    setFocusId(id);
  };

  const removeRow = (id: string) => {
    const next = rowsRef.current.filter((row) => row.id !== id);
    const display = next.length > 0 ? next : [{ id: newMediaPublicationId(), url: '' }];
    setRowState(display);
    commit(display);
  };

  return (
    <div>
      <label className="text-[12px] font-medium text-muted-foreground block mb-1">媒體發佈</label>
      <div className="space-y-2">
        {rows.map((row) => {
          const href = normalizeMediaPublicationUrl(row.url);
          return (
            <div key={row.id} className="flex items-center gap-2">
              <Input
                id={`media-publication-${row.id}`}
                type="text"
                inputMode="url"
                value={row.url}
                disabled={disabled}
                placeholder="https://example.com/article"
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => updateUrl(row.id, event.target.value)}
                onBlur={() => commit(rowsRef.current)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    (event.currentTarget as HTMLInputElement).blur();
                  }
                }}
                className="h-9 text-[13px]"
              />
              {href ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="開啟連結"
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border text-teal-700 hover:bg-muted/50"
                >
                  <ExternalLink size={14} />
                </a>
              ) : (
                <span
                  aria-hidden
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-transparent text-muted-foreground/40"
                >
                  <ExternalLink size={14} />
                </span>
              )}
              <Button
                type="button"
                variant="outline"
                disabled={disabled}
                onClick={() => removeRow(row.id)}
                aria-label="移除連結"
                className={cn('h-9 w-9 shrink-0 p-0 text-muted-foreground')}
              >
                <Trash2 size={14} />
              </Button>
            </div>
          );
        })}
      </div>
      <Button
        type="button"
        variant="outline"
        onClick={addRow}
        disabled={disabled}
        className="mt-2 h-9 gap-1.5 text-[13px] border-teal-200 text-teal-700 bg-teal-50 hover:bg-teal-100"
      >
        <Plus size={14} /> 新增連結
      </Button>
    </div>
  );
}
