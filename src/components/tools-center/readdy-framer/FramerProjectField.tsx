import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronsUpDown, FolderKanban, KeyRound, Link2, Loader2, Plus, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { isValidFramerProjectUrl } from '@/lib/readdyFramerApi';
import type { FramerProjectSummary, FramerWorkspaceSummary } from '@/types/readdyFramer';

const PLAN_LABEL: Record<string, string> = {
  free: 'Free',
  teamEditor: 'Team',
  team: 'Team',
  enterprise: 'Enterprise',
  basic: 'Basic',
  pro: 'Pro',
};

export function framerWorkspaceLabels(workspaces: FramerWorkspaceSummary[]): Map<string, string> {
  const bases = workspaces.map((workspace) => {
    const plan = workspace.plan ? PLAN_LABEL[workspace.plan] || workspace.plan : '';
    return {
      id: workspace.id,
      label: plan ? `${workspace.name} · ${plan}` : workspace.name,
      role: workspace.role,
    };
  });
  const counts = new Map<string, number>();
  for (const item of bases) counts.set(item.label, (counts.get(item.label) || 0) + 1);
  const labels = new Map<string, string>();
  for (const item of bases) {
    const duplicated = (counts.get(item.label) || 0) > 1;
    labels.set(item.id, duplicated && item.role ? `${item.label} · ${item.role}` : item.label);
  }
  return labels;
}

export function findFramerProject(
  url: string,
  projects: FramerProjectSummary[],
): FramerProjectSummary | null {
  const trimmed = url.trim().replace(/\/+$/, '');
  if (!trimmed) return null;
  return (
    projects.find((project) => {
      const projectUrl = project.url.replace(/\/+$/, '');
      return trimmed === projectUrl || trimmed.includes(`/projects/${project.id}`) || trimmed.endsWith(project.id);
    }) || null
  );
}

interface FramerProjectFieldProps {
  framerProjectUrl: string;
  onFramerProjectUrlChange: (value: string) => void;
  mcpConnected: boolean;
  oauthConnecting: boolean;
  onConnectFramer: () => void;
  projects: FramerProjectSummary[];
  workspaces: FramerWorkspaceSummary[];
  loading: boolean;
  error: string | null;
  truncated: boolean;
  onRefresh: () => void;
  onCreate: (input: { title: string; workspaceId: string }) => Promise<void>;
}

export function FramerProjectField({
  framerProjectUrl,
  onFramerProjectUrlChange,
  mcpConnected,
  oauthConnecting,
  onConnectFramer,
  projects,
  workspaces,
  loading,
  error,
  truncated,
  onRefresh,
  onCreate,
}: FramerProjectFieldProps) {
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState('');
  const [createWorkspaceId, setCreateWorkspaceId] = useState('');
  const [creating, setCreating] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);

  const labels = useMemo(() => framerWorkspaceLabels(workspaces), [workspaces]);
  const creatable = workspaces.filter((workspace) => workspace.canCreate);
  const selected = findFramerProject(framerProjectUrl, projects);
  const trimmedUrl = framerProjectUrl.trim();
  const urlValid = !trimmedUrl || isValidFramerProjectUrl(trimmedUrl);
  const targetWorkspace =
    creatable.find((workspace) => workspace.id === createWorkspaceId) ||
    (creatable.length === 1 ? creatable[0] : null);

  useEffect(() => {
    if (createWorkspaceId) return;
    const first = workspaces.find((workspace) => workspace.canCreate);
    if (first) setCreateWorkspaceId(first.id);
  }, [createWorkspaceId, workspaces]);

  const handleCreate = async () => {
    const title = createTitle.trim();
    if (!title || !targetWorkspace?.canCreate) return;
    setCreating(true);
    try {
      await onCreate({ title, workspaceId: targetWorkspace.id });
      setCreateTitle('');
      setCreateOpen(false);
    } catch {
      // 上層已提示錯誤，保留表單讓使用者修改後再送。
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <label className="text-[12px] font-medium text-slate-600">Framer 專案</label>
            {mcpConnected ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#08967F]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#0BB59B]" />
                已連線
              </span>
            ) : (
              <button
                type="button"
                onClick={onConnectFramer}
                disabled={oauthConnecting}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 hover:text-amber-700"
              >
                <KeyRound size={11} />
                {oauthConnecting ? '開啟授權中…' : '未授權，點此連線 Framer'}
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={!mcpConnected || loading}
            title="重新載入 Framer 專案"
            aria-label="重新載入 Framer 專案"
            className="p-1 rounded border border-slate-200 bg-white text-slate-500 hover:text-[#101B2D] hover:bg-slate-50 disabled:opacity-45 transition-colors"
          >
            <RefreshCw size={11} className={cn(loading && 'animate-spin text-[#0BB59B]')} />
          </button>
        </div>
        <div className="flex items-stretch gap-2">
        <div className="min-w-0 flex-1">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              role="combobox"
              aria-expanded={open}
              disabled={!mcpConnected}
              className={cn(
                'w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border bg-white text-[12px] text-left min-w-0 transition-colors disabled:opacity-60',
                urlValid ? 'border-slate-200 hover:border-slate-300 focus:border-[#0BB59B]' : 'border-amber-300',
              )}
            >
              <span className="flex items-center gap-1.5 min-w-0 truncate">
                {loading && projects.length === 0 ? (
                  <>
                    <Loader2 size={12} className="animate-spin text-[#0BB59B] shrink-0" />
                    <span className="text-slate-500 truncate">載入 Framer 專案中…</span>
                  </>
                ) : selected ? (
                  <>
                    <FolderKanban size={12} className="text-[#0BB59B] shrink-0" />
                    <span className="truncate font-medium text-[#101B2D]">{selected.title}</span>
                  </>
                ) : framerProjectUrl.trim() ? (
                  <span className="truncate font-mono text-[#101B2D]">{framerProjectUrl.trim()}</span>
                ) : (
                  <span className="text-slate-400 truncate">
                    {mcpConnected ? '選擇現有 Framer 專案…' : '請先連線 Framer'}
                  </span>
                )}
              </span>
              <ChevronsUpDown size={13} className="text-slate-400 shrink-0" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="z-[120] w-[var(--radix-popover-trigger-width)] min-w-[260px] p-0" align="start">
            <Command>
              <CommandInput placeholder="搜尋 Framer 專案…" className="h-8 text-[12px]" />
              <CommandList className="max-h-60">
                <CommandEmpty className="py-4 px-3 text-center text-[11.5px] text-slate-500">
                  找不到符合的 Framer 專案
                </CommandEmpty>
                <CommandGroup heading={`Framer 專案（${projects.length}）`}>
                  {projects.map((project) => {
                    const isSelected = selected?.id === project.id;
                    return (
                      <CommandItem
                        key={project.id}
                        value={`${project.title} ${project.url} ${project.workspaceName || ''}`}
                        onSelect={() => {
                          onFramerProjectUrlChange(project.url);
                          setOpen(false);
                        }}
                        className="flex items-start gap-2 py-2 px-2.5 cursor-pointer rounded-md data-[selected=true]:bg-[#E7F6F2] data-[selected=true]:text-[#101B2D]"
                      >
                        <Check
                          className={cn(
                            '!size-3.5 mt-0.5 shrink-0 !text-[#0BB59B]',
                            isSelected ? 'opacity-100' : 'opacity-0',
                          )}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[12px] font-semibold !text-[#101B2D]">{project.title}</div>
                        </div>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen((value) => !value)}
          disabled={!mcpConnected}
          className="shrink-0 inline-flex items-center justify-center gap-1 px-3 rounded-lg border border-[#0BB59B]/40 bg-[#E7F6F2] text-[12px] font-semibold text-[#067864] hover:bg-[#d8f3ec] disabled:opacity-50 whitespace-nowrap"
        >
          <Plus size={13} />
          新建 Framer 專案
        </button>
        </div>
        {!urlValid && (
          <p className="text-[11px] text-amber-600">請選擇 Framer 專案，或貼上完整專案連結。</p>
        )}
        <button
          type="button"
          onClick={() => setLinkOpen((value) => !value)}
          className="text-[11px] font-medium text-slate-500 hover:text-[#101B2D]"
        >
          {linkOpen ? '收合專案連結' : '或貼上專案連結'}
        </button>
        {linkOpen && (
          <div
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-lg border bg-slate-50/70',
              urlValid ? 'border-slate-200 focus-within:border-[#0BB59B]' : 'border-amber-300',
            )}
          >
            <Link2 size={14} className="text-slate-400 shrink-0" />
            <input
              type="url"
              value={framerProjectUrl}
              onChange={(event) => onFramerProjectUrlChange(event.target.value)}
              placeholder="https://framer.com/projects/..."
              className="w-full bg-transparent text-[12px] font-mono text-[#101B2D] outline-none placeholder:text-slate-400"
            />
          </div>
        )}
        {truncated && (
          <p className="text-[11px] text-slate-400">列表顯示最近開啟的專案。</p>
        )}
        {error && (
          <div className="flex items-center justify-between gap-2 text-[11px] text-rose-600">
            <span className="truncate">{error}</span>
            <button type="button" onClick={onRefresh} className="shrink-0 font-semibold underline hover:text-rose-700">
              重試
            </button>
          </div>
        )}
      </div>

      {createOpen && (
        <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-2.5 space-y-2">
          <p className="text-[11px] text-slate-500">在已連線的 Framer 帳號建立，完成後會自動選用。</p>
          <input
            value={createTitle}
            onChange={(event) => setCreateTitle(event.target.value)}
            placeholder="新專案名稱，例如 bwdesign.com 2026"
            className="w-full px-2.5 py-1.5 rounded border border-slate-200 bg-white text-[12px] text-[#101B2D] outline-none focus:border-[#0BB59B]"
          />
          {creatable.length > 1 && (
            <select
              value={createWorkspaceId}
              onChange={(event) => setCreateWorkspaceId(event.target.value)}
              aria-label="Framer 工作區"
              className="w-full px-2.5 py-1.5 rounded border border-slate-200 bg-white text-[12px] text-[#101B2D] outline-none focus:border-[#0BB59B]"
            >
              {creatable.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {labels.get(workspace.id) || workspace.name}
                </option>
              ))}
            </select>
          )}
          {mcpConnected && !loading && creatable.length === 0 && (
            <p className="text-[11px] text-amber-700">這個 Framer 帳號沒有建立專案的權限。</p>
          )}
          <button
            type="button"
            disabled={creating || !createTitle.trim() || !targetWorkspace?.canCreate}
            onClick={() => void handleCreate()}
            className="w-full py-1.5 rounded-lg bg-[#101B2D] hover:bg-[#192842] text-white text-[12px] font-semibold disabled:opacity-50"
          >
            {creating ? '建立中…' : '建立並選用'}
          </button>
        </div>
      )}
    </div>
  );
}
