import { useMemo, useState } from 'react';
import { ExternalLink, FileText, FolderOpen, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useQuotationDocsList } from '@/hooks/useQuotationDocs';
import {
  formatDocDate,
  formatFileSize,
  isImageDoc,
  quotationDocExpiryStatus,
} from '@/lib/quotationDocs';
import { buildQuotationProjectHref } from '@/lib/quotationProjectNavigation';
import { pitchingStatusConfig } from '@/data/pitchingData';

function expiryBadge(status: ReturnType<typeof quotationDocExpiryStatus>) {
  if (status === 'expired') return { label: '已過期', className: 'bg-rose-50 text-rose-700' };
  if (status === 'expiring') return { label: '即將到期', className: 'bg-amber-50 text-amber-800' };
  return null;
}

export function QuotationDocsList() {
  const { rows, loading, error } = useQuotationDocsList();
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  const typeOptions = useMemo(() => {
    const seen = new Set<string>();
    const options: { id: string; display: string }[] = [];
    for (const row of rows) {
      if (!row.docTypeId || seen.has(row.docTypeId)) continue;
      seen.add(row.docTypeId);
      options.push({
        id: row.docTypeId,
        display: row.docTypeDisplay || '—',
      });
    }
    return options;
  }, [rows]);

  const filtered = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return rows.filter((row) => {
      if (typeFilter !== 'all' && row.docTypeId !== typeFilter) return false;
      if (!query) return true;
      return (
        row.fileName.toLowerCase().includes(query) ||
        row.projectDisplayName.toLowerCase().includes(query) ||
        row.projectClientName.toLowerCase().includes(query) ||
        row.docTypeDisplay.toLowerCase().includes(query)
      );
    });
  }, [rows, searchQuery, typeFilter]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[32px] font-bold tracking-tight">報價單列表</h1>
        <p className="text-[14px] text-muted-foreground mt-1">
          已上傳的報價單文件。請到 Pitching / Project 的「項目文件」上傳。
        </p>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 px-3 py-1.5 border border-border rounded-md text-sm flex-1 max-w-[280px] bg-white">
          <Search size={14} className="text-muted-foreground" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-transparent border-none outline-none text-sm w-full placeholder:text-muted-foreground"
            placeholder="搜尋檔案、項目或客戶..."
            aria-label="搜尋報價單"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          aria-label="篩選文件類型"
          className="px-3 py-1.5 border border-border rounded-md text-[13px] bg-white"
        >
          <option value="all">所有類型</option>
          {typeOptions.map((type) => (
            <option key={type.id} value={type.id}>
              {type.display}
            </option>
          ))}
        </select>
        <span className="text-[12px] text-muted-foreground">共 {filtered.length} 份</span>
      </div>

      {error && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
          無法載入報價單：{error}
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-10 text-center text-[13px] text-muted-foreground">
          載入報價單中…
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-8 text-center">
          <FolderOpen size={24} className="mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-[13px] text-muted-foreground">尚未上傳報價單</p>
          <p className="text-[12px] text-muted-foreground/70 mt-1">
            請到項目詳情的「項目文件」上傳報價單檔案
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">類型</th>
                  <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">檔案</th>
                  <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">項目</th>
                  <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">客戶</th>
                  <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">文件日期</th>
                  <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">到期日</th>
                  <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">操作</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const status = quotationDocExpiryStatus(row.expiryDate);
                  const badge = expiryBadge(status);
                  const projectStatus = pitchingStatusConfig[row.projectStatus as keyof typeof pitchingStatusConfig];
                  return (
                    <tr key={row.id} className="border-b border-border/50 hover:bg-muted/20">
                      <td className="px-4 py-3 text-[13px] font-medium whitespace-nowrap">
                        {row.docTypeDisplay || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 min-w-0">
                          {isImageDoc(row.mimeType, row.fileName) ? (
                            <img
                              src={row.fileUrl}
                              alt=""
                              className="h-9 w-9 rounded object-cover border border-border/60 bg-muted shrink-0"
                            />
                          ) : (
                            <div className="h-9 w-9 rounded bg-teal-50 text-teal-700 flex items-center justify-center shrink-0">
                              <FileText size={14} />
                            </div>
                          )}
                          <div className="min-w-0">
                            <a
                              href={row.fileUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[13px] font-medium text-teal-700 hover:text-teal-800 truncate block"
                            >
                              {row.fileName}
                            </a>
                            <p className="text-[11px] text-muted-foreground">{formatFileSize(row.fileSize)}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {row.quotationClientProjectId ? (
                          <a
                            href={buildQuotationProjectHref(row.quotationClientProjectId, row.projectStatus)}
                            className="text-[13px] font-medium text-teal-700 hover:text-teal-800"
                          >
                            {row.projectDisplayName}
                          </a>
                        ) : (
                          <span className="text-[13px]">{row.projectDisplayName}</span>
                        )}
                        {projectStatus && (
                          <span className={cn('ml-2 text-[11px] font-medium px-1.5 py-0.5 rounded', projectStatus.bgColor, projectStatus.color)}>
                            {projectStatus.label}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[13px] whitespace-nowrap">{row.projectClientName}</td>
                      <td className="px-4 py-3 text-[13px] tabular-nums text-muted-foreground whitespace-nowrap">
                        {formatDocDate(row.documentDate)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] tabular-nums">{formatDocDate(row.expiryDate)}</span>
                          {badge && (
                            <span className={cn('text-[11px] font-medium px-1.5 py-0.5 rounded', badge.className)}>
                              {badge.label}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <a
                          href={row.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors inline-flex"
                          aria-label={`開啟 ${row.fileName}`}
                        >
                          <ExternalLink size={13} />
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
