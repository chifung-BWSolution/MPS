import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { autoSyncAsanaPitchingIfNeeded, invokeAsanaPitchingSync } from '@/lib/asanaPitchingApi';
import { QUOTATION_CLIENT_PROJECT_TABLE } from '@/hooks/useQuotationClientProjects';
import { optionalIsoDate, type PitchingProjectType, type PitchingStatus } from '@/data/pitchingData';

export const ASANA_SYNCED_TASKS_TABLE = 'asana_synced_tasks';

export type AsanaSyncedTask = {
  asanaTaskGid: string;
  asanaProjectGid: string;
  asanaProjectName: string;
  asanaSectionName: string;
  displayName: string;
  clientName: string;
  inquiryDate: string;
  description: string;
  projectTypes: PitchingProjectType[];
  assignedPm: string;
  assignedPmName: string;
  mappedStatus: PitchingStatus;
  asanaLink: string;
  syncedAt: string | null;
  imported: boolean;
  importedProjectId?: string;
};

type StagingRow = {
  asana_task_gid: string;
  asana_project_gid: string | null;
  asana_project_name: string | null;
  asana_section_name: string | null;
  display_name: string;
  client_name: string | null;
  inquiry_date: string;
  description: string | null;
  project_types: string[] | null;
  assigned_pm: string | null;
  assigned_pm_name: string | null;
  mapped_status: string;
  asana_link: string | null;
  synced_at: string | null;
};

function mapStatus(value: string): PitchingStatus {
  return (['initial', 'following_up', 'confirmed', 'closed'].includes(value)
    ? value
    : 'initial') as PitchingStatus;
}

export type AsanaSyncSource = {
  projectName: string;
  syncYearFrom: number | null;
};

export function useAsanaSyncedTasks() {
  const { session } = useAuth();
  const [tasks, setTasks] = useState<AsanaSyncedTask[]>([]);
  const [syncSources, setSyncSources] = useState<AsanaSyncSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [stagingRes, importedRes, sourcesRes] = await Promise.all([
      supabase
        .from(ASANA_SYNCED_TASKS_TABLE)
        .select(
          'asana_task_gid, asana_project_gid, asana_project_name, asana_section_name, display_name, client_name, inquiry_date, description, project_types, assigned_pm, assigned_pm_name, mapped_status, asana_link, synced_at',
        )
        .order('inquiry_date', { ascending: false }),
      supabase
        .from(QUOTATION_CLIENT_PROJECT_TABLE)
        .select('id, asana_task_gid')
        .not('asana_task_gid', 'is', null),
      supabase
        .from('asana_pitching_projects')
        .select('project_name, sync_year_from')
        .eq('enabled', true)
        .order('project_name', { ascending: true }),
    ]);

    if (stagingRes.error) {
      setError(stagingRes.error.message);
      setTasks([]);
      setLoading(false);
      return;
    }

    const importedByGid = new Map<string, string>();
    for (const row of importedRes.data || []) {
      const gid = (row.asana_task_gid || '').trim();
      if (gid) importedByGid.set(gid, row.id);
    }

    const mapped = ((stagingRes.data as StagingRow[] | null) ?? []).map((row) => {
      const gid = row.asana_task_gid;
      const importedId = importedByGid.get(gid);
      return {
        asanaTaskGid: gid,
        asanaProjectGid: row.asana_project_gid || '',
        asanaProjectName: row.asana_project_name || '',
        asanaSectionName: row.asana_section_name || '',
        displayName: row.display_name,
        clientName: row.client_name || '',
        inquiryDate: optionalIsoDate(row.inquiry_date) || String(row.inquiry_date).slice(0, 10),
        description: row.description || '',
        projectTypes: (row.project_types || []) as PitchingProjectType[],
        assignedPm: row.assigned_pm || '',
        assignedPmName: row.assigned_pm_name || '',
        mappedStatus: mapStatus(row.mapped_status),
        asanaLink: row.asana_link || '',
        syncedAt: row.synced_at,
        imported: Boolean(importedId),
        importedProjectId: importedId,
      };
    });

    setError(importedRes.error?.message ?? sourcesRes.error?.message ?? null);
    setTasks(mapped);
    setSyncSources(
      (sourcesRes.data || []).map((row) => ({
        projectName: (row.project_name || '').trim(),
        syncYearFrom: typeof row.sync_year_from === 'number' ? row.sync_year_from : null,
      })).filter((row) => row.projectName),
    );
    const latest = mapped.map((t) => t.syncedAt).filter(Boolean).sort().pop();
    setLastSyncedAt(latest ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!session) return;
    void refresh();
  }, [session, refresh]);

  useEffect(() => {
    if (!session) return;
    void (async () => {
      setSyncing(true);
      await autoSyncAsanaPitchingIfNeeded();
      await refresh();
      setSyncing(false);
    })();
  }, [session, refresh]);

  const syncNow = useCallback(async () => {
    setSyncing(true);
    try {
      const result = await invokeAsanaPitchingSync();
      await refresh();
      return result;
    } finally {
      setSyncing(false);
    }
  }, [refresh]);

  const pendingCount = useMemo(() => tasks.filter((t) => !t.imported).length, [tasks]);
  const importedCount = useMemo(() => tasks.filter((t) => t.imported).length, [tasks]);

  return {
    tasks,
    loading,
    syncing,
    error,
    lastSyncedAt,
    syncSources,
    pendingCount,
    importedCount,
    refresh,
    syncNow,
  };
}
