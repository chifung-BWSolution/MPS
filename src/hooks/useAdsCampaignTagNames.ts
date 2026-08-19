import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { AdsPlatform } from '@/types/adsTags';

export function useAdsCampaignTagNames(
  platform: AdsPlatform | null,
  campaignRowId: string | null,
) {
  const { session } = useAuth();
  const [tagNames, setTagNames] = useState<string[]>([]);

  const refresh = useCallback(async () => {
    if (!platform || !campaignRowId) {
      setTagNames([]);
      return;
    }

    const assignRes = await supabase
      .from('ads_campaign_tags')
      .select('tag_id')
      .eq('platform', platform)
      .eq('campaign_row_id', campaignRowId);
    if (assignRes.error) {
      setTagNames([]);
      return;
    }

    const tagIds = [...new Set((assignRes.data ?? []).map((row) => row.tag_id).filter(Boolean))];
    if (tagIds.length === 0) {
      setTagNames([]);
      return;
    }

    const tagRes = await supabase.from('ads_tags').select('name').in('id', tagIds);
    if (tagRes.error) {
      setTagNames([]);
      return;
    }

    setTagNames(
      ((tagRes.data as Array<{ name?: string }> | null) ?? [])
        .map((row) => (row.name || '').trim())
        .filter(Boolean),
    );
  }, [platform, campaignRowId]);

  useEffect(() => {
    void refresh();
  }, [session, refresh]);

  return { tagNames, refresh };
}
