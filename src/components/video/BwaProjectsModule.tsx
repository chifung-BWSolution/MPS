import { useMemo, useState } from 'react';
import { ExternalLink, Pencil, RefreshCw, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { CrudModal } from '@/components/ui/crud-modal';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useBwaProjects } from '@/hooks/useBwaProjects';
import {
  bwaCustomerLabel,
  bwaProjectListMetrics,
  bwaProjectTitle,
  bwaStatusOptions,
  filterBwaProjects,
  parseYoutubeUrlInput,
  type BwaProject,
} from '@/lib/bwaProjects';

function formatWhen(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('zh-HK', { hour12: false });
}

function formatProfit(value: number | null): string {
  if (value == null || Number.isNaN(value)) return '—';
  return value.toLocaleString('zh-HK', { maximumFractionDigits: 0 });
}

export function BwaProjectsModule() {
  const { projects, generatedAt, loading, error, reload, updateYoutube } = useBwaProjects();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [editing, setEditing] = useState<BwaProject | null>(null);
  const [youtubeDraft, setYoutubeDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const metrics = useMemo(() => bwaProjectListMetrics(projects), [projects]);
  const statuses = useMemo(() => bwaStatusOptions(projects), [projects]);
  const filtered = useMemo(
    () => filterBwaProjects(projects, { search, status }),
    [projects, search, status],
  );
  const generatedLabel = formatWhen(generatedAt);

  const openEdit = (project: BwaProject) => {
    setEditing(project);
    setYoutubeDraft(project.youtube_url || '');
    setFormError(null);
  };

  const handleSave = async () => {
    if (!editing) return;
    const parsed = parseYoutubeUrlInput(youtubeDraft);
    if (!parsed.ok) {
      setFormError(parsed.error);
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await updateYoutube(editing.id, parsed.youtube_url);
      toast.success(parsed.youtube_url ? '已更新 YouTube 連結' : '已清除 YouTube 連結');
      setEditing(null);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : '儲存失敗');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-0">
      <div className="sticky top-[calc(48px+var(--app-banner-h))] z-30 -mx-6 px-6 pt-1 pb-3 mb-5 space-y-3 bg-[#f5f8fc]/95 backdrop-blur-sm border-b border-[rgba(13,26,45,0.06)]">
        <div>
          <h1 className="text-[32px] font-bold tracking-tight">BWA 項目</h1>
          <p className="text-[14px] text-muted-foreground mt-1">
            從 PMS 讀取全部 BWA 項目，並寫回該項目的 YouTube 連結。
            {generatedLabel ? ` 資料時間 ${generatedLabel}。` : ''}
          </p>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card px-4 py-3">
            <span className="text-[11px] text-muted-foreground">項目總數</span>
            <p className="text-[18px] font-bold">{metrics.total}</p>
          </div>
          <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card px-4 py-3">
            <span className="text-[11px] text-muted-foreground">已有 YouTube</span>
            <p className="text-[18px] font-bold text-teal-600">{metrics.withYoutube}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-[320px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜尋編號、名稱、客戶或地址..."
              className="w-full pl-9 pr-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600 bg-white"
            />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[160px] h-9 text-[12px]"><SelectValue placeholder="狀態" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部狀態</SelectItem>
              {statuses.map((item) => (
                <SelectItem key={item} value={item}>{item}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="ml-auto"
            disabled={loading}
            onClick={() => void reload()}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            重新載入
          </Button>
        </div>
        {error ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
            無法載入 BWA 項目：{error}
          </div>
        ) : null}
      </div>

      <div className="bg-white border border-[rgba(13,26,45,0.08)] rounded-md shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] min-w-[980px]">
            <thead className="bg-slate-50 border-b border-slate-200 text-muted-foreground">
              <tr>
                <th className="font-medium px-3 py-2.5 text-left">編號</th>
                <th className="font-medium px-3 py-2.5 text-left">項目</th>
                <th className="font-medium px-3 py-2.5 text-left">狀態</th>
                <th className="font-medium px-3 py-2.5 text-left">客戶</th>
                <th className="font-medium px-3 py-2.5 text-left">地區</th>
                <th className="font-medium px-3 py-2.5 text-right">毛利</th>
                <th className="font-medium px-3 py-2.5 text-left">YouTube</th>
                <th className="font-medium px-3 py-2.5 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading && projects.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">載入中…</td>
                </tr>
              ) : null}
              {!loading && filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                    {error ? '尚未取得項目' : '沒有符合的項目'}
                  </td>
                </tr>
              ) : null}
              {filtered.map((project) => {
                const customer = bwaCustomerLabel(project);
                const externalName = project.external_project_name?.trim();
                const title = bwaProjectTitle(project);
                return (
                  <tr key={project.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-2.5 whitespace-nowrap font-medium">{project.project_code || '—'}</td>
                    <td className="px-3 py-2.5 min-w-[180px] max-w-[280px]">
                      <div className="font-medium leading-tight truncate" title={title}>{title}</div>
                      {externalName && externalName !== title ? (
                        <div className="text-[11px] text-muted-foreground leading-tight truncate mt-0.5" title={externalName}>
                          {externalName}
                        </div>
                      ) : project.site_address ? (
                        <div className="text-[11px] text-muted-foreground leading-tight truncate mt-0.5" title={project.site_address}>
                          {project.site_address}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <div>{project.status || '—'}</div>
                      {project.payment_status ? (
                        <div className="text-[11px] text-muted-foreground mt-0.5">{project.payment_status}</div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5 max-w-[160px] truncate" title={customer || undefined}>{customer || '—'}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{project.district?.label || '—'}</td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">{formatProfit(project.estimated_profit)}</td>
                    <td className="px-3 py-2.5 max-w-[220px]">
                      {project.youtube_url ? (
                        <a
                          href={project.youtube_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-teal-700 hover:underline max-w-full"
                        >
                          <span className="truncate">{project.youtube_url}</span>
                          <ExternalLink size={12} className="shrink-0" />
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => openEdit(project)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-teal-50 hover:text-teal-700"
                        title="更新 YouTube"
                      >
                        <Pencil size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <CrudModal
        isOpen={!!editing}
        onClose={() => !saving && setEditing(null)}
        title={editing ? `YouTube — ${bwaProjectTitle(editing)}` : 'YouTube'}
        size="md"
      >
        <div className="space-y-4">
          <p className="text-[12px] text-muted-foreground leading-relaxed">
            只會更新這個項目的 YouTube 連結。接受 https 的 watch、youtu.be、Shorts、直播或嵌入連結。留空並儲存可清除。
          </p>
          <div className="space-y-1.5">
            <label className="text-[12px] font-medium" htmlFor="bwa-youtube-url">YouTube 連結</label>
            <Input
              id="bwa-youtube-url"
              value={youtubeDraft}
              onChange={(e) => setYoutubeDraft(e.target.value)}
              placeholder="https://www.youtube.com/watch?v="
              disabled={saving}
            />
            {formError ? <p className="text-[12px] text-red-600">{formError}</p> : null}
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="secondary" disabled={saving} onClick={() => setEditing(null)}>取消</Button>
            <Button
              className="bg-teal-600 hover:bg-teal-700 text-white"
              disabled={saving}
              onClick={() => void handleSave()}
            >
              {saving ? '儲存中…' : '儲存'}
            </Button>
          </div>
        </div>
      </CrudModal>
    </div>
  );
}
