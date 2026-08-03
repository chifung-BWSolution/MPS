import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

export type GraphicDesignRecord = {
  id: string;
  title: string;
  websiteProfileId?: string;
  websiteName: string;
  company: string;
  brand: string;
  designType: string;
  status: string;
  designer: string;
  createdDate: string;
  dimensions: string;
  platform: string;
  manHours: number;
  projectType: string;
  projectName: string;
  notes: string;
  reportDate: string;
  asanaLink: string;
  outputLink: string;
};

type DbRow = {
  id: string;
  title: string;
  website_profile_id: string | null;
  website_name: string | null;
  company: string | null;
  brand: string | null;
  design_type: string;
  status: string;
  designer: string | null;
  created_date: string | null;
  dimensions: string | null;
  platform: string | null;
  man_hours: number | string | null;
  project_type: string | null;
  project_name: string | null;
  notes: string | null;
  report_date: string | null;
  asana_link: string | null;
  output_link: string | null;
};

function dateOnly(value: string | null | undefined): string {
  if (!value) return '';
  return String(value).substring(0, 10);
}

function mapRow(row: DbRow): GraphicDesignRecord {
  return {
    id: row.id,
    title: row.title ?? '',
    websiteProfileId: row.website_profile_id ?? undefined,
    websiteName: row.website_name ?? '',
    company: row.company ?? '',
    brand: row.brand ?? '',
    designType: row.design_type || 'other',
    status: row.status || 'draft',
    designer: row.designer ?? '',
    createdDate: dateOnly(row.created_date),
    dimensions: row.dimensions ?? '',
    platform: row.platform ?? '',
    manHours: row.man_hours != null ? Number(row.man_hours) : 0,
    projectType: row.project_type ?? 'none',
    projectName: row.project_name ?? '',
    notes: row.notes ?? '',
    reportDate: dateOnly(row.report_date),
    asanaLink: row.asana_link ?? '',
    outputLink: row.output_link ?? '',
  };
}

function toInsertRow(d: GraphicDesignRecord) {
  return {
    id: d.id,
    title: d.title,
    website_profile_id: d.websiteProfileId ?? null,
    website_name: d.websiteName || null,
    company: d.company || null,
    brand: d.brand || null,
    design_type: d.designType,
    status: d.status,
    designer: d.designer || null,
    created_date: d.createdDate || null,
    dimensions: d.dimensions || null,
    platform: d.platform || null,
    man_hours: d.manHours ?? 0,
    project_type: d.projectType || null,
    project_name: d.projectName || null,
    notes: d.notes || null,
    report_date: d.reportDate || null,
    asana_link: d.asanaLink || null,
    output_link: d.outputLink || null,
  };
}

export function useGraphicDesigns() {
  const { session } = useAuth();
  const [designs, setDesigns] = useState<GraphicDesignRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase
      .from('graphic_designs')
      .select('*')
      .order('created_date', { ascending: false, nullsFirst: false });
    if (err) {
      setError(err.message);
      setDesigns([]);
    } else {
      setError(null);
      setDesigns((data as DbRow[] | null)?.map(mapRow) ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [session, refresh]);

  const addDesign = useCallback(async (data: Omit<GraphicDesignRecord, 'id'> & { id?: string }) => {
    const id = data.id || `gd_${Date.now()}`;
    const record: GraphicDesignRecord = { ...data, id };
    const { error: err } = await supabase.from('graphic_designs').insert(toInsertRow(record));
    if (!err) setDesigns(prev => [record, ...prev]);
    return { data: err ? null : record, error: err };
  }, []);

  const updateDesign = useCallback(async (id: string, data: Partial<GraphicDesignRecord>) => {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.title !== undefined) patch.title = data.title;
    if (data.websiteProfileId !== undefined) patch.website_profile_id = data.websiteProfileId ?? null;
    if (data.websiteName !== undefined) patch.website_name = data.websiteName || null;
    if (data.company !== undefined) patch.company = data.company || null;
    if (data.brand !== undefined) patch.brand = data.brand || null;
    if (data.designType !== undefined) patch.design_type = data.designType;
    if (data.status !== undefined) patch.status = data.status;
    if (data.designer !== undefined) patch.designer = data.designer || null;
    if (data.createdDate !== undefined) patch.created_date = data.createdDate || null;
    if (data.dimensions !== undefined) patch.dimensions = data.dimensions || null;
    if (data.platform !== undefined) patch.platform = data.platform || null;
    if (data.manHours !== undefined) patch.man_hours = data.manHours ?? 0;
    if (data.projectType !== undefined) patch.project_type = data.projectType || null;
    if (data.projectName !== undefined) patch.project_name = data.projectName || null;
    if (data.notes !== undefined) patch.notes = data.notes || null;
    if (data.reportDate !== undefined) patch.report_date = data.reportDate || null;
    if (data.asanaLink !== undefined) patch.asana_link = data.asanaLink || null;
    if (data.outputLink !== undefined) patch.output_link = data.outputLink || null;
    const { error: err } = await supabase.from('graphic_designs').update(patch).eq('id', id);
    if (!err) setDesigns(prev => prev.map(d => (d.id === id ? { ...d, ...data } : d)));
    return err;
  }, []);

  const deleteDesign = useCallback(async (id: string) => {
    const { error: err } = await supabase.from('graphic_designs').delete().eq('id', id);
    if (!err) setDesigns(prev => prev.filter(d => d.id !== id));
    return err;
  }, []);

  const deleteDesigns = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return null;
    const { error: err } = await supabase.from('graphic_designs').delete().in('id', ids);
    if (!err) setDesigns(prev => prev.filter(d => !ids.includes(d.id)));
    return err;
  }, []);

  return { designs, loading, error, refresh, addDesign, updateDesign, deleteDesign, deleteDesigns };
}
