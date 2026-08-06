import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { PitchingProjectType, PitchingRecord, PitchingStatus } from '@/data/pitchingData';

type DbRow = {
  id: string;
  asana_task_gid: string | null;
  pitching_code: string | null;
  client_id: string | null;
  client_name: string | null;
  display_name: string;
  inquiry_date: string;
  description: string | null;
  project_types: string[] | null;
  assigned_pm: string | null;
  assigned_pm_name: string | null;
  status: string;
  asana_link: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

function mapRow(row: DbRow): PitchingRecord {
  const status = (['initial', 'following_up', 'confirmed', 'closed'].includes(row.status)
    ? row.status
    : 'initial') as PitchingStatus;

  return {
    id: row.id,
    pitchingId: row.pitching_code || row.id,
    clientId: row.client_id ?? undefined,
    clientName: row.client_name || '—',
    displayName: row.display_name,
    inquiryDate: String(row.inquiry_date).slice(0, 10),
    description: row.description ?? undefined,
    projectTypes: (row.project_types || []) as PitchingProjectType[],
    assignedPm: row.assigned_pm || '',
    assignedPmName: row.assigned_pm_name || '—',
    status,
    asanaLink: row.asana_link ?? undefined,
    notes: row.notes ?? undefined,
    followUps: [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function usePitchingRecords() {
  const { session } = useAuth();
  const [records, setRecords] = useState<PitchingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase
      .from('pitching_records')
      .select('*')
      .order('inquiry_date', { ascending: false });

    if (err) {
      setError(err.message);
      setRecords([]);
    } else {
      setError(null);
      const mapped = ((data as DbRow[] | null) ?? []).map(mapRow);
      setRecords(mapped);
      const latest = mapped.map((r) => r.updatedAt).filter(Boolean).sort().pop();
      setLastSyncedAt(latest ?? null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [session, refresh]);

  const addRecord = useCallback(
    async (
      data: Omit<PitchingRecord, 'id' | 'pitchingId' | 'followUps' | 'createdAt' | 'updatedAt'> & {
        pitchingId?: string;
      },
    ) => {
      const id = `pitch_${Date.now()}`;
      const now = new Date().toISOString();
      const row = {
        id,
        pitching_code: data.pitchingId || `MPS-${id.slice(-8)}`,
        client_id: data.clientId ?? null,
        client_name: data.clientName || null,
        display_name: data.displayName,
        inquiry_date: data.inquiryDate,
        description: data.description ?? null,
        project_types: data.projectTypes,
        assigned_pm: data.assignedPm || null,
        assigned_pm_name: data.assignedPmName || '',
        status: data.status,
        asana_link: data.asanaLink ?? null,
        notes: data.notes ?? null,
        created_at: now,
        updated_at: now,
      };
      const { error: err } = await supabase.from('pitching_records').insert(row);
      const record: PitchingRecord = {
        ...data,
        id,
        pitchingId: row.pitching_code,
        followUps: [],
        createdAt: now,
        updatedAt: now,
      };
      if (!err) setRecords((prev) => [record, ...prev]);
      return { data: err ? null : record, error: err };
    },
    [],
  );

  return { records, loading, error, lastSyncedAt, refresh, addRecord };
}
