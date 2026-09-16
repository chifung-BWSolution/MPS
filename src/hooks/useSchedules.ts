import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { isProjectHubRelatedType } from '@/lib/projectsHub';
import { resolveProjectHubId } from '@/lib/resolveProjectHub';
import {
  SCHEDULES_TABLE,
  optionalIsoDate,
  sortSchedules,
  validateScheduleInput,
  type Schedule,
  type ScheduleInput,
} from '@/lib/schedules';

type DbRow = {
  id: string;
  title: string;
  date: string;
  description: string | null;
  related_project_id: string;
  created_at: string;
  updated_at: string;
};

function mapRow(row: DbRow): Schedule {
  return {
    id: row.id,
    title: row.title,
    date: optionalIsoDate(row.date) ?? row.date,
    description: row.description?.trim() || '',
    relatedProjectId: row.related_project_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function inputToRow(input: ScheduleInput, relatedProjectId: string) {
  return {
    title: input.title.trim(),
    date: optionalIsoDate(input.date) ?? input.date.trim(),
    description: input.description?.trim() || null,
    related_project_id: relatedProjectId,
    updated_at: new Date().toISOString(),
  };
}

export function useSchedules(
  relatedType: string | undefined,
  relatedId: string | undefined,
) {
  const [rows, setRows] = useState<Schedule[]>([]);
  const [projectId, setProjectId] = useState<string | undefined>();
  const [loading, setLoading] = useState(Boolean(relatedType && relatedId));
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!isProjectHubRelatedType(relatedType) || !relatedId?.trim()) {
      setRows([]);
      setProjectId(undefined);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const resolved = await resolveProjectHubId(relatedType, relatedId);
    if (resolved.error || !resolved.data) {
      setError(resolved.error?.message ?? '找不到對應的 projects 紀錄');
      setProjectId(undefined);
      setRows([]);
      setLoading(false);
      return;
    }

    setProjectId(resolved.data);
    const { data, error: err } = await supabase
      .from(SCHEDULES_TABLE)
      .select('id, title, date, description, related_project_id, created_at, updated_at')
      .eq('related_project_id', resolved.data)
      .order('date', { ascending: true })
      .order('created_at', { ascending: true });

    if (err) {
      setError(err.message);
      setRows([]);
    } else {
      setError(null);
      setRows((data as DbRow[] | null)?.map(mapRow) ?? []);
    }
    setLoading(false);
  }, [relatedType, relatedId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addSchedule = useCallback(
    async (input: ScheduleInput): Promise<{ error: { message: string } | null }> => {
      const validation = validateScheduleInput(input);
      if (validation) return { error: { message: validation } };
      if (!projectId) return { error: { message: '找不到對應的 projects 紀錄' } };

      const { data, error: err } = await supabase
        .from(SCHEDULES_TABLE)
        .insert(inputToRow(input, projectId))
        .select('id, title, date, description, related_project_id, created_at, updated_at')
        .single();

      if (err || !data) return { error: err ?? { message: '新增失敗' } };
      setRows((prev) => sortSchedules([...prev, mapRow(data as DbRow)]));
      return { error: null };
    },
    [projectId],
  );

  const updateSchedule = useCallback(
    async (
      id: string,
      input: ScheduleInput,
    ): Promise<{ error: { message: string } | null }> => {
      const validation = validateScheduleInput(input);
      if (validation) return { error: { message: validation } };
      if (!projectId) return { error: { message: '找不到對應的 projects 紀錄' } };

      const { data, error: err } = await supabase
        .from(SCHEDULES_TABLE)
        .update(inputToRow(input, projectId))
        .eq('id', id)
        .select('id, title, date, description, related_project_id, created_at, updated_at')
        .single();

      if (err || !data) return { error: err ?? { message: '更新失敗' } };
      const next = mapRow(data as DbRow);
      setRows((prev) => sortSchedules(prev.map((row) => (row.id === id ? next : row))));
      return { error: null };
    },
    [projectId],
  );

  const deleteSchedule = useCallback(async (id: string): Promise<{ error: { message: string } | null }> => {
    const { error: err } = await supabase.from(SCHEDULES_TABLE).delete().eq('id', id);
    if (err) return { error: err };
    setRows((prev) => prev.filter((row) => row.id !== id));
    return { error: null };
  }, []);

  return {
    rows,
    projectId,
    loading,
    error,
    refresh,
    addSchedule,
    updateSchedule,
    deleteSchedule,
  };
}
