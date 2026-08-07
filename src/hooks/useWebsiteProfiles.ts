import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { WebsiteProfileFull, WebsiteLevel, ProfileType } from '@/types/app';
import { useAuth } from '@/context/AuthContext';
import { websiteProfiles as staticWebsiteProfiles } from '@/data/websiteData';

type DbRow = {
  id: string;
  website_name: string;
  domain_url: string | null;
  profile_type: string;
  project_category: string;
  level: number;
  platform: string | null;
  brand: string | null;
  company: string | null;
  status: string;
  articles_count: number;
  videos_count: number;
  total_hours: number;
  project_id: string | null;
  company_id: string | null;
  brand_id: string | null;
  brand_list_id: string | null;
  company_list_id: string | null;
  notes: string | null;
  hosting_provider: string | null;
  system_type: string | null;
};

function mapRow(row: DbRow): WebsiteProfileFull {
  return {
    id: row.id,
    projectId: row.project_id ?? undefined,
    // Prefer new UUID FKs; fall back to legacy text ids
    companyId: row.company_list_id ?? row.company_id ?? '',
    brandId: row.brand_list_id ?? row.brand_id ?? '',
    websiteName: row.website_name,
    domainUrl: row.domain_url ?? undefined,
    platform: (row.platform as WebsiteProfileFull['platform']) ?? 'other',
    company: row.company ?? '',
    brand: row.brand ?? '',
    level: row.level as WebsiteLevel,
    status: row.status as WebsiteProfileFull['status'],
    hostingProvider: row.hosting_provider ?? undefined,
    systemType: (row.system_type as WebsiteProfileFull['systemType']) ?? undefined,
    pagesCount: 0,
    articlesCount: row.articles_count,
    videosCount: row.videos_count,
    socialPostsCount: 0,
    keywordsCount: 0,
    pluginsCount: 0,
    totalHours: row.total_hours,
    profileType: (row.profile_type as ProfileType) ?? 'website',
    notes: row.notes ?? undefined,
    assignedStaff: [],
    externalLinks: [],
  };
}

export function useWebsiteProfiles() {
  const { session } = useAuth();
  const [profiles, setProfiles] = useState<WebsiteProfileFull[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    supabase
      .from('webandsystem_list')
      .select('*')
      .order('level', { ascending: true })
      .then(({ data, error }) => {
        if (error) {
          setError(error.message);
          setProfiles(staticWebsiteProfiles as WebsiteProfileFull[]);
        } else if (!data || data.length === 0) {
          setProfiles(staticWebsiteProfiles as WebsiteProfileFull[]);
        } else {
          setProfiles((data as DbRow[]).map(mapRow));
        }
        setLoading(false);
      });
  }, [session]);

  const addProfile = useCallback(async (site: WebsiteProfileFull) => {
    const row = {
      id: site.id,
      website_name: site.websiteName,
      domain_url: site.domainUrl ?? null,
      profile_type: site.profileType ?? 'website',
      project_category: 'internal',
      level: site.level,
      platform: site.platform,
      brand: site.brand,
      company: site.company,
      status: site.status,
      articles_count: site.articlesCount,
      videos_count: site.videosCount,
      total_hours: site.totalHours,
      project_id: site.projectId ?? null,
      company_id: site.companyId || null,
      brand_id: site.brandId || null,
      company_list_id: site.companyId || null,
      brand_list_id: site.brandId || null,
      notes: site.notes ?? null,
      hosting_provider: site.hostingProvider ?? null,
      system_type: site.systemType ?? null,
    };
    const { error } = await supabase.from('webandsystem_list').insert(row);
    if (!error) {
      setProfiles(prev => [...prev, site]);
    }
    return error;
  }, []);

  const updateProfile = useCallback(async (id: string, updates: Partial<WebsiteProfileFull>) => {
    const row: Record<string, unknown> = {};
    if (updates.websiteName !== undefined) row.website_name = updates.websiteName;
    if (updates.domainUrl !== undefined) row.domain_url = updates.domainUrl;
    if (updates.profileType !== undefined) row.profile_type = updates.profileType;
    if (updates.level !== undefined) row.level = updates.level;
    if (updates.platform !== undefined) row.platform = updates.platform;
    if (updates.brand !== undefined) row.brand = updates.brand;
    if (updates.company !== undefined) row.company = updates.company;
    if (updates.status !== undefined) row.status = updates.status;
    if (updates.articlesCount !== undefined) row.articles_count = updates.articlesCount;
    if (updates.videosCount !== undefined) row.videos_count = updates.videosCount;
    if (updates.totalHours !== undefined) row.total_hours = updates.totalHours;
    if (updates.companyId !== undefined) {
      row.company_id = updates.companyId || null;
      row.company_list_id = updates.companyId || null;
    }
    if (updates.brandId !== undefined) {
      row.brand_id = updates.brandId || null;
      row.brand_list_id = updates.brandId || null;
    }
    if (updates.notes !== undefined) row.notes = updates.notes;
    if (updates.hostingProvider !== undefined) row.hosting_provider = updates.hostingProvider ?? null;
    if (updates.systemType !== undefined) row.system_type = updates.systemType ?? null;
    row.updated_at = new Date().toISOString();

    const { error } = await supabase.from('webandsystem_list').update(row).eq('id', id);
    if (!error) {
      setProfiles(prev =>
        prev.map(p => (p.id === id ? { ...p, ...updates } : p))
      );
    }
    return error;
  }, []);

  return { profiles, loading, error, addProfile, updateProfile };
}
