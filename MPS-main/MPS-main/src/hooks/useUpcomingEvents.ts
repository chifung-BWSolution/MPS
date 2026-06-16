import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

export type UpcomingEvent = {
  id: string;
  title: string;
  type: string;
  date: string;
  company: string;
  brand: string;
  platform?: string;
  hours?: number;
  notes?: string;
};

type DbRow = {
  id: string;
  title: string;
  type: string;
  event_date: string;
  company: string;
  brand: string;
  platform: string | null;
  hours: number | null;
  notes: string | null;
};

const mapRow = (row: DbRow): UpcomingEvent => ({
  id: row.id,
  title: row.title,
  type: row.type,
  date: row.event_date,
  company: row.company ?? '',
  brand: row.brand ?? '',
  platform: row.platform ?? undefined,
  hours: row.hours ?? undefined,
  notes: row.notes ?? undefined,
});

export function useUpcomingEvents() {
  const { session } = useAuth();
  const [events, setEvents] = useState<UpcomingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    supabase
      .from('upcoming_event')
      .select('*')
      .order('event_date', { ascending: true })
      .then(({ data, error }) => {
        if (error) {
          setError(error.message);
          setEvents([]);
        } else {
          setEvents((data as DbRow[] | null)?.map(mapRow) ?? []);
        }
        setLoading(false);
      });
  }, [session]);

  const addEvent = useCallback(async (event: UpcomingEvent) => {
    const row = {
      id: event.id,
      title: event.title,
      type: event.type,
      event_date: event.date,
      company: event.company,
      brand: event.brand,
      platform: event.platform ?? null,
      hours: event.hours ?? null,
      notes: event.notes ?? null,
    };
    const { error } = await supabase.from('upcoming_event').insert(row);
    if (!error) {
      setEvents(prev => [...prev, event]);
    }
    return error;
  }, []);

  return { events, loading, error, addEvent };
}
