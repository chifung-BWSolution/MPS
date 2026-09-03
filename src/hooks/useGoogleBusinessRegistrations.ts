import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { GoogleBusinessRegistration } from '@/types/marketingOps';

type DbRow = {
  id: string;
  website_profile_id: string | null;
  url: string;
  registered_at: string;
  content: string;
};

function mapRow(row: DbRow): GoogleBusinessRegistration {
  return {
    id: row.id,
    websiteProfileId: row.website_profile_id ?? undefined,
    url: row.url,
    registeredAt: String(row.registered_at).substring(0, 10),
    content: row.content ?? '',
  };
}

export function useGoogleBusinessRegistrations() {
  
  const [registrations, setRegistrations] = useState<GoogleBusinessRegistration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase
      .from('google_business_registrations')
      .select('*')
      .order('registered_at', { ascending: false });
    if (err) {
      setError(err.message);
      setRegistrations([]);
    } else {
      setError(null);
      setRegistrations((data as DbRow[] | null)?.map(mapRow) ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addRegistration = useCallback(
    async (data: Omit<GoogleBusinessRegistration, 'id'> & { id?: string }) => {
      const id = data.id || `gb_${Date.now()}`;
      const row = {
        id,
        website_profile_id: data.websiteProfileId ?? null,
        url: data.url,
        registered_at: data.registeredAt,
        content: data.content,
      };
      const { error: err } = await supabase.from('google_business_registrations').insert(row);
      const record = { ...data, id };
      if (!err) setRegistrations(prev => [record, ...prev]);
      return { data: err ? null : record, error: err };
    },
    [],
  );

  const updateRegistration = useCallback(async (id: string, data: Partial<GoogleBusinessRegistration>) => {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.websiteProfileId !== undefined) patch.website_profile_id = data.websiteProfileId || null;
    if (data.url !== undefined) patch.url = data.url;
    if (data.registeredAt !== undefined) patch.registered_at = data.registeredAt;
    if (data.content !== undefined) patch.content = data.content;
    const { error: err } = await supabase.from('google_business_registrations').update(patch).eq('id', id);
    if (!err) {
      setRegistrations(prev => prev.map(r => (r.id === id ? { ...r, ...data } : r)));
    }
    return err;
  }, []);

  const deleteRegistration = useCallback(async (id: string) => {
    const { error: err } = await supabase.from('google_business_registrations').delete().eq('id', id);
    if (!err) setRegistrations(prev => prev.filter(r => r.id !== id));
    return err;
  }, []);

  return {
    registrations,
    loading,
    error,
    refresh,
    addRegistration,
    updateRegistration,
    deleteRegistration,
  };
}
