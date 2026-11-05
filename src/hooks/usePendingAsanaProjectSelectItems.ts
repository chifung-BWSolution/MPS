import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  importedAsanaGidSet,
  pendingAsanaProjectSelectItems,
  type AsanaSyncedTaskRef,
} from '@/lib/asanaDayReportLink';
import type { ProjectSelectItem } from '@/lib/searchableProjectSelect';
import type { QuotationProjectAsanaRef } from '@/lib/asanaTaskLink';

/** Asana tasks for the day-report picker, including imported and cancelled tasks. Does not sync Asana. */
export function usePendingAsanaProjectSelectItems(): ProjectSelectItem[] {
  const [items, setItems] = useState<ProjectSelectItem[]>([]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const [tasksRes, importedRes, pitchingRes] = await Promise.all([
        supabase
          .from('asana_synced_tasks')
          .select('asana_task_gid, display_name, asana_project_gid, case_closed_reason')
          .order('inquiry_date', { ascending: false }),
        supabase
          .from('quotation_client_project')
          .select('id, asana_link, asana_task_gid')
          .or('asana_link.not.is.null,asana_task_gid.not.is.null'),
        supabase
          .from('asana_pitching_projects')
          .select('project_gid, project_name')
          .eq('enabled', true)
          .order('project_name', { ascending: true }),
      ]);

      if (cancelled || tasksRes.error || importedRes.error) return;

      const tasks: AsanaSyncedTaskRef[] = (tasksRes.data ?? []).map((row) => ({
        asanaTaskGid: String(row.asana_task_gid || ''),
        displayName: String(row.display_name || ''),
        asanaProjectGid: String(row.asana_project_gid || ''),
        caseClosedReason: String(row.case_closed_reason || ''),
      }));
      const pending = pendingAsanaProjectSelectItems(
        tasks,
        importedAsanaGidSet((importedRes.data ?? []) as QuotationProjectAsanaRef[]),
        (pitchingRes.data ?? []).map((row) => ({
          projectGid: String(row.project_gid || ''),
          projectName: String(row.project_name || ''),
        })),
      );
      if (!cancelled) setItems(pending);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return items;
}
