import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { Vchannel, VchannelDeviceType, VchannelImportance, VchannelStatus } from '@/types/vchannel';
import { mapVchannelRow, vchannelToDbRow } from '@/lib/vchannelMappers';
import type { PlatformStatusValue } from '@/lib/vchannelPlatformStatus';

const VCHANNEL_SELECT = '*, brand_list ( brand_code )';

export function useVchannels() {
  const { session } = useAuth();
  const [channels, setChannels] = useState<Vchannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchChannels = useCallback(async () => {
    setLoading(true);
    const { data, error: fetchError } = await supabase
      .from('vchannels')
      .select(VCHANNEL_SELECT)
      .order('channel_code');

    if (fetchError) {
      setError(fetchError.message);
      setChannels([]);
    } else {
      setError(null);
      setChannels((data ?? []).map(row => mapVchannelRow(row as never)));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchChannels();
  }, [session, fetchChannels]);

  const addChannel = useCallback(async (input: {
    channelCode: string;
    internalName: string;
    publicName: string;
    importance: VchannelImportance;
    deviceType: VchannelDeviceType;
    brandListId: string | null;
    status: VchannelStatus;
    platformStatus: Record<string, PlatformStatusValue>;
    notes?: string;
  }) => {
    const row = vchannelToDbRow({
      ...input,
      videoCount: 0,
      caseCount: 0,
    });
    const { data, error: insertError } = await supabase
      .from('vchannels')
      .insert(row)
      .select(VCHANNEL_SELECT)
      .single();

    if (insertError) return insertError;
    if (data) setChannels(prev => [...prev, mapVchannelRow(data as never)].sort((a, b) => a.channelCode.localeCompare(b.channelCode)));
    return null;
  }, []);

  const updateChannel = useCallback(async (id: string, updates: Partial<Vchannel>) => {
    const existing = channels.find(c => c.id === id);
    if (!existing) return new Error('Channel not found');

    const merged = { ...existing, ...updates };
    const row = vchannelToDbRow(merged);
    const { data, error: updateError } = await supabase
      .from('vchannels')
      .update(row)
      .eq('id', id)
      .select(VCHANNEL_SELECT)
      .single();

    if (updateError) return updateError;
    if (data) setChannels(prev => prev.map(c => c.id === id ? mapVchannelRow(data as never) : c));
    return null;
  }, [channels]);

  const deleteChannel = useCallback(async (id: string) => {
    const { error: deleteError } = await supabase.from('vchannels').delete().eq('id', id);
    if (!deleteError) setChannels(prev => prev.filter(c => c.id !== id));
    return deleteError;
  }, []);

  return { channels, loading, error, fetchChannels, addChannel, updateChannel, deleteChannel };
}
