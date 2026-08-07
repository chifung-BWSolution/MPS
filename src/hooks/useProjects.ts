import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

export type ProjectRelatedType = 'quotation_client' | 'webandsystem' | 'vchannel';

export type MasterProject = {
  id: string;
  relatedId: string;
  relatedType: ProjectRelatedType;
  name: string;
  status: string;
  isActive: boolean;
  companyListId?: string;
  brandListId?: string;
  companyName?: string;
  brandName?: string;
  clientName?: string;
  meta: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
};

type DbRow = {
  id: string;
  related_id: string;
  related_type: string;
  name: string;
  status: string;
  is_active: boolean;
  company_list_id: string | null;
  brand_list_id: string | null;
  company_name: string | null;
  brand_name: string | null;
  client_name: string | null;
  meta: Record<string, unknown> | null;
  created_at: string | null;
  updated_at: string | null;
};

const validRelatedTypes = new Set<ProjectRelatedType>([
  'quotation_client',
  'webandsystem',
  'vchannel',
]);

function mapRow(row: DbRow): MasterProject {
  const relatedType = validRelatedTypes.has(row.related_type as ProjectRelatedType)
    ? (row.related_type as ProjectRelatedType)
    : 'webandsystem';
  return {
    id: row.id,
    relatedId: row.related_id,
    relatedType,
    name: row.name,
    status: row.status || '',
    isActive: !!row.is_active,
    companyListId: row.company_list_id ?? undefined,
    brandListId: row.brand_list_id ?? undefined,
    companyName: row.company_name ?? undefined,
    brandName: row.brand_name ?? undefined,
    clientName: row.client_name ?? undefined,
    meta: (row.meta && typeof row.meta === 'object') ? row.meta : {},
    createdAt: row.created_at ?? undefined,
    updatedAt: row.updated_at ?? undefined,
  };
}

export type UseProjectsOptions = {
  relatedType?: ProjectRelatedType | ProjectRelatedType[];
  activeOnly?: boolean;
};

export function useProjects(options: UseProjectsOptions = {}) {
  const { session } = useAuth();
  const { relatedType, activeOnly = false } = options;
  const [projects, setProjects] = useState<MasterProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const relatedTypeKey = useMemo(() => {
    if (!relatedType) return '';
    return Array.isArray(relatedType) ? relatedType.slice().sort().join(',') : relatedType;
  }, [relatedType]);

  const reload = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('projects')
      .select('*')
      .order('name', { ascending: true });

    if (activeOnly) {
      query = query.eq('is_active', true);
    }

    if (relatedTypeKey) {
      const types = relatedTypeKey.split(',') as ProjectRelatedType[];
      if (types.length === 1) {
        query = query.eq('related_type', types[0]);
      } else {
        query = query.in('related_type', types);
      }
    }

    const { data, error: qError } = await query;
    if (qError) {
      setError(qError.message);
      setProjects([]);
    } else {
      setError(null);
      setProjects(((data || []) as DbRow[]).map(mapRow));
    }
    setLoading(false);
  }, [activeOnly, relatedTypeKey]);

  useEffect(() => {
    void reload();
  }, [reload, session]);

  const getById = useCallback(
    (id: string | undefined | null) => (id ? projects.find(p => p.id === id) : undefined),
    [projects],
  );

  const asSelectItems = useMemo(
    () => projects.map(p => ({ id: p.id, name: p.name })),
    [projects],
  );

  return {
    projects,
    loading,
    error,
    reload,
    getById,
    asSelectItems,
  };
}

export const relatedTypeLabels: Record<ProjectRelatedType, string> = {
  webandsystem: '網站/系統',
  quotation_client: '客戶項目',
  vchannel: '影片頻道',
};
