import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import {
  ga4LinkedWebsiteIds,
  googleAdsStatusByWebsiteId,
  resolveGa4ConnectionStatus,
  type Ga4ConnectionStatus,
  type GoogleAdsConnectionStatus,
} from '@/lib/websiteConnectionStatus';

type CampaignWebsiteRow = {
  website_profile_id: string;
  campaign_row_id: string | null;
  customer_id: string | null;
  campaign_id: string | null;
};

type CampaignRow = {
  id: string;
  customer_id: string | null;
  campaign_id: string | null;
  status: string | null;
};

type Ga4PropertyRow = {
  website_profile_id: string | null;
};

export function useWebsiteConnectionStatus() {
  const { session } = useAuth();
  const [googleAdsByWebsiteId, setGoogleAdsByWebsiteId] = useState<
    Record<string, GoogleAdsConnectionStatus>
  >({});
  const [ga4LinkedIds, setGa4LinkedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [linkRes, campRes, ga4Res] = await Promise.all([
      supabase
        .from('google_ads_campaign_websites')
        .select('website_profile_id,campaign_row_id,customer_id,campaign_id'),
      supabase
        .from('google_ads_campaigns')
        .select('id,customer_id,campaign_id,status'),
      supabase
        .from('ga4_properties')
        .select('website_profile_id'),
    ]);

    const messages = [linkRes.error?.message, campRes.error?.message, ga4Res.error?.message]
      .filter(Boolean)
      .join(' ');
    setError(messages || null);

    setGoogleAdsByWebsiteId(
      googleAdsStatusByWebsiteId(
        ((linkRes.data as CampaignWebsiteRow[] | null) ?? []).map((row) => ({
          websiteProfileId: row.website_profile_id,
          campaignRowId: row.campaign_row_id,
          customerId: row.customer_id,
          campaignId: row.campaign_id,
        })),
        ((campRes.data as CampaignRow[] | null) ?? []).map((row) => ({
          id: row.id,
          customerId: row.customer_id,
          campaignId: row.campaign_id,
          status: row.status,
        })),
      ),
    );
    setGa4LinkedIds(
      ga4LinkedWebsiteIds(
        ((ga4Res.data as Ga4PropertyRow[] | null) ?? []).map((row) => ({
          websiteProfileId: row.website_profile_id,
        })),
      ),
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [session, refresh]);

  const ga4StatusFor = useCallback(
    (websiteId: string): Ga4ConnectionStatus =>
      resolveGa4ConnectionStatus(ga4LinkedIds.has(websiteId)),
    [ga4LinkedIds],
  );

  return {
    googleAdsByWebsiteId,
    ga4LinkedIds,
    ga4StatusFor,
    loading,
    error,
    refresh,
  };
}
