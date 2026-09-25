import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

const CHUNK = 80;

type AssignmentRow = {
  activity_key: string;
  staff_id: string;
};

async function loadAssignments(keys: string[]): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  for (let i = 0; i < keys.length; i += CHUNK) {
    const chunk = keys.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from('facebook_ads_change_history_staff')
      .select('activity_key, staff_id')
      .in('activity_key', chunk);
    if (error) throw error;
    for (const row of (data ?? []) as AssignmentRow[]) {
      if (row.activity_key && row.staff_id) map[row.activity_key] = row.staff_id;
    }
  }
  return map;
}

export function useFacebookAdsChangeHistoryStaff(activityKeys: string[]) {
  const keySignature = useMemo(() => [...new Set(activityKeys.filter(Boolean))].sort().join('\n'), [activityKeys]);
  const keys = useMemo(() => (keySignature ? keySignature.split('\n') : []), [keySignature]);
  const [byKey, setByKey] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    if (!keys.length) {
      setByKey({});
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    void loadAssignments(keys)
      .then((map) => {
        if (cancelled) return;
        setByKey(map);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setByKey({});
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [keys]);

  const setStaff = useCallback(async (activityKey: string, staffId: string) => {
    const nextStaffId = staffId.trim();
    setSavingKey(activityKey);
    setError(null);
    setByKey((current) => {
      const next = { ...current };
      if (nextStaffId) next[activityKey] = nextStaffId;
      else delete next[activityKey];
      return next;
    });

    const query = nextStaffId
      ? supabase.from('facebook_ads_change_history_staff').upsert(
          {
            activity_key: activityKey,
            staff_id: nextStaffId,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'activity_key' },
        )
      : supabase.from('facebook_ads_change_history_staff').delete().eq('activity_key', activityKey);

    const { error: saveError } = await query;
    setSavingKey(null);
    if (saveError) {
      setError(saveError.message);
      const restored = await loadAssignments([activityKey]).catch(() => ({}));
      setByKey((current) => {
        const next = { ...current };
        if (restored[activityKey]) next[activityKey] = restored[activityKey];
        else delete next[activityKey];
        return next;
      });
    }
  }, []);

  return { byKey, loading, error, savingKey, setStaff };
}
