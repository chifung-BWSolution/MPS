import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

export type ProjectRelatedType = 'quotation_client' | 'webandsystem' | 'vchannel' | 'manual';
export type ProjectCategory = 'internal' | 'client';
export type ProjectLevel = 1 | 2 | 3 | 4 | 5;
export type ProjectKind = 'website' | 'system' | 'quotation_client' | 'vchannel' | 'manual';

export type MasterProject = {
  id: string;
  relatedId: string;
  relatedType: ProjectRelatedType;
  name: string;
  status: string;
  isActive: boolean;
  companyListId?: string;
  brandListId?: string;
  clientName?: string;
  meta: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
};

export type ProjectWriteInput = {
  name: string;
  clientName?: string | null;
  status: string;
  companyListId?: string | null;
  brandListId?: string | null;
  projectCategory?: ProjectCategory;
  level?: ProjectLevel | null;
  notes?: string | null;
  description?: string | null;
  profileType?: 'website' | 'system';
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
  client_name: string | null;
  meta: Record<string, unknown> | null;
  created_at: string | null;
  updated_at: string | null;
};

const validRelatedTypes = new Set<ProjectRelatedType>([
  'quotation_client',
  'webandsystem',
  'vchannel',
  'manual',
]);

const INACTIVE_STATUSES = new Set([
  'cancelled',
  'completed',
  'archived',
  'closed',
  'paused',
]);

function metaObject(meta: Record<string, unknown> | null | undefined): Record<string, unknown> {
  return meta && typeof meta === 'object' ? meta : {};
}

function mapRow(row: DbRow): MasterProject {
  const relatedType = validRelatedTypes.has(row.related_type as ProjectRelatedType)
    ? (row.related_type as ProjectRelatedType)
    : 'manual';
  return {
    id: row.id,
    relatedId: row.related_id,
    relatedType,
    name: row.name,
    status: row.status || '',
    isActive: !!row.is_active,
    companyListId: row.company_list_id ?? undefined,
    brandListId: row.brand_list_id ?? undefined,
    clientName: row.client_name ?? undefined,
    meta: metaObject(row.meta),
    createdAt: row.created_at ?? undefined,
    updatedAt: row.updated_at ?? undefined,
  };
}

export function projectCategoryOf(project: MasterProject): ProjectCategory {
  if (project.relatedType === 'quotation_client') return 'client';
  return project.meta.project_category === 'client' ? 'client' : 'internal';
}

export function projectLevelOf(project: MasterProject): ProjectLevel | undefined {
  const level = project.meta.level;
  if (typeof level === 'number' && level >= 1 && level <= 5) return level as ProjectLevel;
  const importance = project.meta.importance;
  if (typeof importance === 'string' && /^A[1-5]$/.test(importance)) {
    return Number(importance.slice(1)) as ProjectLevel;
  }
  return undefined;
}

export function projectSubtitleOf(project: MasterProject): string {
  const domain = typeof project.meta.domain_url === 'string' ? project.meta.domain_url.trim() : '';
  if (domain) return domain;
  if (project.clientName) return project.clientName;
  const publicName = typeof project.meta.public_name === 'string' ? project.meta.public_name.trim() : '';
  return publicName;
}

export function projectKindOf(project: MasterProject): ProjectKind {
  if (project.relatedType === 'webandsystem') {
    return project.meta.profile_type === 'system' ? 'system' : 'website';
  }
  return project.relatedType;
}

export function projectKindLabel(kind: ProjectKind): string {
  switch (kind) {
    case 'website': return '網站';
    case 'system': return '系統';
    case 'quotation_client': return '客戶項目';
    case 'vchannel': return '影片頻道';
    case 'manual': return '自訂';
  }
}

function isActiveStatus(status: string): boolean {
  return !INACTIVE_STATUSES.has(status);
}

async function orgCodesForListIds(companyListId?: string | null, brandListId?: string | null) {
  const [companyRes, brandRes] = await Promise.all([
    companyListId
      ? supabase.from('company_list').select('company_code').eq('uuid', companyListId).maybeSingle()
      : Promise.resolve({ data: null as { company_code: string } | null }),
    brandListId
      ? supabase.from('brand_list').select('brand_code').eq('id', brandListId).maybeSingle()
      : Promise.resolve({ data: null as { brand_code: string } | null }),
  ]);
  return {
    companyCode: companyRes.data?.company_code || null,
    brandCode: brandRes.data?.brand_code || null,
  };
}

function buildManualMeta(input: ProjectWriteInput, previous: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...previous,
    project_category: input.projectCategory ?? previous.project_category ?? 'internal',
    level: input.level ?? previous.level ?? 3,
    notes: input.notes ?? previous.notes ?? '',
    description: input.description ?? previous.description ?? '',
  };
}

export type UseProjectsOptions = {
  relatedType?: ProjectRelatedType | ProjectRelatedType[];
  activeOnly?: boolean;
};

export function useProjects(options: UseProjectsOptions = {}) {
  
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
  }, [reload]);

  const getById = useCallback(
    (id: string | undefined | null) => (id ? projects.find(p => p.id === id) : undefined),
    [projects],
  );

  const asSelectItems = useMemo(
    () => projects.map(p => ({ id: p.id, name: p.name })),
    [projects],
  );

  const addProject = useCallback(async (input: ProjectWriteInput) => {
    const name = input.name.trim();
    if (!name) return { error: { message: '請輸入項目名稱' } };

    const row = {
      related_id: crypto.randomUUID(),
      related_type: 'manual' as const,
      name,
      status: input.status || 'planning',
      is_active: isActiveStatus(input.status || 'planning'),
      company_list_id: input.companyListId || null,
      brand_list_id: input.brandListId || null,
      client_name: input.clientName?.trim() || null,
      meta: buildManualMeta(input),
    };

    const { data, error: insertError } = await supabase
      .from('projects')
      .insert(row)
      .select('*')
      .single();

    if (insertError) return { error: insertError };
    if (data) setProjects(prev => [...prev, mapRow(data as DbRow)].sort((a, b) => a.name.localeCompare(b.name, 'zh-HK')));
    return { error: null };
  }, []);

  const updateProject = useCallback(async (project: MasterProject, input: ProjectWriteInput) => {
    const name = input.name.trim();
    if (!name) return { error: { message: '請輸入項目名稱' } };

    let writeError: { message: string } | null = null;

    if (project.relatedType === 'webandsystem') {
      const { companyCode, brandCode } = await orgCodesForListIds(input.companyListId, input.brandListId);
      const patch: Record<string, unknown> = {
        website_name: name,
        status: input.status,
        company_list_id: input.companyListId || null,
        brand_list_id: input.brandListId || null,
        company: companyCode,
        brand: brandCode,
        project_category: input.projectCategory ?? projectCategoryOf(project),
        updated_at: new Date().toISOString(),
      };
      if (input.level != null) patch.level = input.level;
      if (input.notes !== undefined) patch.notes = input.notes || null;
      if (input.profileType) patch.profile_type = input.profileType;
      const { error: sourceError } = await supabase
        .from('webandsystem_list')
        .update(patch)
        .eq('id', project.relatedId);
      writeError = sourceError;
    } else if (project.relatedType === 'quotation_client') {
      const { error: sourceError } = await supabase
        .from('quotation_client_project')
        .update({
          display_name: name,
          client_name: input.clientName?.trim() || null,
          status: input.status,
          updated_at: new Date().toISOString(),
        })
        .eq('id', project.relatedId);
      writeError = sourceError;
    } else if (project.relatedType === 'vchannel') {
      const patch: Record<string, unknown> = {
        internal_name: name,
        status: input.status,
        brand_list_id: input.brandListId || null,
        updated_at: new Date().toISOString(),
      };
      if (input.level != null) patch.importance = `A${input.level}`;
      const { error: sourceError } = await supabase
        .from('vchannels')
        .update(patch)
        .eq('id', project.relatedId);
      writeError = sourceError;
    } else {
      const { error: sourceError } = await supabase
        .from('projects')
        .update({
          name,
          status: input.status,
          is_active: isActiveStatus(input.status),
          company_list_id: input.companyListId || null,
          brand_list_id: input.brandListId || null,
          client_name: input.clientName?.trim() || null,
          meta: buildManualMeta(input, project.meta),
          updated_at: new Date().toISOString(),
        })
        .eq('id', project.id);
      writeError = sourceError;
    }

    if (writeError) return { error: writeError };
    await reload();
    return { error: null };
  }, [reload]);

  const deleteProject = useCallback(async (project: MasterProject) => {
    let writeError: { message: string } | null = null;

    if (project.relatedType === 'webandsystem') {
      const { error: sourceError } = await supabase
        .from('webandsystem_list')
        .delete()
        .eq('id', project.relatedId);
      writeError = sourceError;
    } else if (project.relatedType === 'quotation_client') {
      const { error: sourceError } = await supabase
        .from('quotation_client_project')
        .delete()
        .eq('id', project.relatedId);
      writeError = sourceError;
    } else if (project.relatedType === 'vchannel') {
      const { error: sourceError } = await supabase
        .from('vchannels')
        .delete()
        .eq('id', project.relatedId);
      writeError = sourceError;
    } else {
      const { error: sourceError } = await supabase
        .from('projects')
        .delete()
        .eq('id', project.id);
      writeError = sourceError;
    }

    if (writeError) return { error: writeError };
    setProjects(prev => prev.filter(p => p.id !== project.id));
    return { error: null };
  }, []);

  return {
    projects,
    loading,
    error,
    reload,
    getById,
    asSelectItems,
    addProject,
    updateProject,
    deleteProject,
  };
}

export const relatedTypeLabels: Record<ProjectRelatedType, string> = {
  webandsystem: '網站/系統',
  quotation_client: '客戶項目',
  vchannel: '影片頻道',
  manual: '自訂',
};

export const relatedTypeBadgeClass: Record<ProjectRelatedType, string> = {
  webandsystem: 'bg-blue-50 text-blue-700 border-blue-200',
  quotation_client: 'bg-amber-50 text-amber-700 border-amber-200',
  vchannel: 'bg-purple-50 text-purple-700 border-purple-200',
  manual: 'bg-slate-100 text-slate-700 border-slate-200',
};
