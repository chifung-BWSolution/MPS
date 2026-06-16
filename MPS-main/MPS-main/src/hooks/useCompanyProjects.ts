import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Project } from '@/types/app';
import { useAuth } from '@/context/AuthContext';

type DbRow = {
  id: string;
  name: string;
  client_name: string | null;
  company_id: string | null;
  brand_id: string | null;
  project_type: string;
  project_category: string;
  status: string;
  progress: number;
  assigned_pm: string | null;
  assigned_pm_id: string | null;
  brand: string | null;
  company: string | null;
  budget_total: number;
  budget_used: number;
  start_date: string | null;
  end_date: string | null;
  description: string | null;
  priority: string;
  billing_model: string | null;
  billing_frequency: string | null;
  contract_start_date: string | null;
  contract_duration: number | null;
  service_items: unknown | null;
};

function mapRow(row: DbRow): Project {
  return {
    id: row.id,
    name: row.name,
    clientName: row.client_name ?? undefined,
    companyId: row.company_id ?? '',
    brandId: row.brand_id ?? '',
    projectType: row.project_type as Project['projectType'],
    projectCategory: 'internal',
    status: row.status as Project['status'],
    progress: row.progress,
    assignedPm: row.assigned_pm ?? undefined,
    assignedPmId: row.assigned_pm_id ?? undefined,
    brand: row.brand ?? '',
    company: row.company ?? '',
    budgetTotal: row.budget_total,
    budgetUsed: row.budget_used,
    startDate: row.start_date ?? '',
    endDate: row.end_date ?? undefined,
    description: row.description ?? undefined,
    priority: row.priority as Project['priority'],
    billingModel: row.billing_model as Project['billingModel'] ?? undefined,
    billingFrequency: row.billing_frequency as Project['billingFrequency'] ?? undefined,
    contractStartDate: row.contract_start_date ?? undefined,
    contractDuration: row.contract_duration ?? undefined,
    serviceItems: (row.service_items as Project['serviceItems']) ?? undefined,
  };
}

export function useCompanyProjects() {
  const { session } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    supabase
      .from('company_project')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) {
          setError(error.message);
          setProjects([]);
        } else {
          setProjects((data as DbRow[]).map(mapRow));
        }
        setLoading(false);
      });
  }, [session]);

  const addProject = useCallback(async (project: Project) => {
    const row = {
      id: project.id,
      name: project.name,
      client_name: project.clientName ?? null,
      company_id: project.companyId,
      brand_id: project.brandId,
      project_type: project.projectType,
      project_category: 'internal',
      status: project.status,
      progress: project.progress,
      assigned_pm: project.assignedPm ?? null,
      assigned_pm_id: project.assignedPmId ?? null,
      brand: project.brand ?? null,
      company: project.company ?? null,
      budget_total: project.budgetTotal,
      budget_used: project.budgetUsed,
      start_date: project.startDate || null,
      end_date: project.endDate ?? null,
      description: project.description ?? null,
      priority: project.priority,
      billing_model: project.billingModel ?? null,
      billing_frequency: project.billingFrequency ?? null,
      contract_start_date: project.contractStartDate ?? null,
      contract_duration: project.contractDuration ?? null,
      service_items: project.serviceItems ? JSON.stringify(project.serviceItems) : null,
    };
    const { error } = await supabase.from('company_project').insert(row);
    if (!error) setProjects(prev => [project, ...prev]);
    return error;
  }, []);

  const updateProject = useCallback(async (id: string, updates: Partial<Project>) => {
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (updates.name !== undefined) row.name = updates.name;
    if (updates.clientName !== undefined) row.client_name = updates.clientName;
    if (updates.status !== undefined) row.status = updates.status;
    if (updates.progress !== undefined) row.progress = updates.progress;
    if (updates.priority !== undefined) row.priority = updates.priority;
    if (updates.budgetUsed !== undefined) row.budget_used = updates.budgetUsed;
    if (updates.budgetTotal !== undefined) row.budget_total = updates.budgetTotal;
    if (updates.assignedPm !== undefined) row.assigned_pm = updates.assignedPm;
    if (updates.endDate !== undefined) row.end_date = updates.endDate;
    if (updates.description !== undefined) row.description = updates.description;
    if (updates.serviceItems !== undefined) row.service_items = JSON.stringify(updates.serviceItems);

    const { error } = await supabase.from('company_project').update(row).eq('id', id);
    if (!error) setProjects(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
    return error;
  }, []);

  const deleteProject = useCallback(async (id: string) => {
    const { error } = await supabase.from('company_project').delete().eq('id', id);
    if (!error) setProjects(prev => prev.filter(p => p.id !== id));
    return error;
  }, []);

  return { projects, loading, error, addProject, updateProject, deleteProject };
}
