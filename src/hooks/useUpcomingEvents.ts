import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

export type UpcomingEventStatus = 'pending_publish' | 'published';

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
  status: UpcomingEventStatus;
};

export const UPCOMING_EVENT_STATUS_LABELS: Record<UpcomingEventStatus, string> = {
  pending_publish: '待發佈',
  published: '已發佈',
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
  status: string | null;
};

function normalizeStatus(value: string | null | undefined): UpcomingEventStatus {
  return value === 'published' ? 'published' : 'pending_publish';
}

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
  status: normalizeStatus(row.status),
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
      status: normalizeStatus(event.status),
    };
    const { error } = await supabase.from('upcoming_event').insert(row);
    if (!error) {
      setEvents(prev => [...prev, { ...event, status: normalizeStatus(event.status) }]);
    }
    return error;
  }, []);

  const updateEvent = useCallback(async (id: string, updates: Omit<UpcomingEvent, 'id'>) => {
    const status = normalizeStatus(updates.status);
    const row = {
      title: updates.title,
      type: updates.type,
      event_date: updates.date,
      company: updates.company,
      brand: updates.brand,
      platform: updates.platform ?? null,
      hours: updates.hours ?? null,
      notes: updates.notes ?? null,
      status,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from('upcoming_event').update(row).eq('id', id);
    if (!error) {
      setEvents(prev =>
        prev.map(e => (e.id === id ? { id, ...updates, status } : e)),
      );
    }
    return error;
  }, []);

  const deleteEvent = useCallback(async (id: string) => {
    const { error } = await supabase.from('upcoming_event').delete().eq('id', id);
    if (!error) {
      setEvents(prev => prev.filter(e => e.id !== id));
    }
    return error;
  }, []);

  return { events, loading, error, addEvent, updateEvent, deleteEvent };
}
