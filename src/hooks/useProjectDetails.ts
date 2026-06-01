import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface TeamMember {
  id: string;
  name: string;
  avatarUrl?: string;
  roleInProject: string;
  estimatedHours: number;
}

export interface ProjectTaskDetail {
  id: string;
  projectId: string;
  title: string;
  assignee?: string;
  status: 'todo' | 'in_progress' | 'review' | 'done';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  startDate?: string;
  endDate?: string;
  estimatedHours?: number;
  actualHours?: number;
  description?: string;
}

export interface ClientInfo {
  companyName: string;
  contactPerson: string;
  email: string;
  phone: string;
  companyPhone: string;
  website: string;
  tags: string[];
}

export interface YearPlan {
  year: number;
  targetRevenue: number;
  targetProjects: number;
  targetArticles: number;
  targetVideos: number;
  targetSocialPosts: number;
}

interface DetailsRow {
  team_members: TeamMember[];
  tasks: ProjectTaskDetail[];
  client_info: Partial<ClientInfo> | null;
  year_plan: YearPlan | Record<string, never> | null;
  extra: Record<string, unknown> | null;
}

const emptyDetails: DetailsRow = {
  team_members: [],
  tasks: [],
  client_info: null,
  year_plan: null,
  extra: null,
};

export function useProjectDetails(projectId: string | undefined) {
  const [teamMembers, setTeamMembersState] = useState<TeamMember[]>([]);
  const [tasks, setTasksState] = useState<ProjectTaskDetail[]>([]);
  const [clientInfo, setClientInfoState] = useState<ClientInfo | null>(null);
  const [yearPlan, setYearPlanState] = useState<YearPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const loadedIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!projectId) {
      setTeamMembersState([]);
      setTasksState([]);
      setClientInfoState(null);
      setYearPlanState(null);
      setLoading(false);
      loadedIdRef.current = null;
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from('company_project_details')
        .select('team_members, tasks, client_info, year_plan, extra')
        .eq('project_id', projectId)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        console.warn('[useProjectDetails] load failed:', error.message);
      }
      const row = (data as DetailsRow | null) || emptyDetails;
      setTeamMembersState(Array.isArray(row.team_members) ? row.team_members : []);
      setTasksState(Array.isArray(row.tasks) ? row.tasks : []);
      const ci = row.client_info && typeof row.client_info === 'object' && Object.keys(row.client_info).length > 0
        ? (row.client_info as ClientInfo) : null;
      setClientInfoState(ci);
      const yp = row.year_plan && typeof row.year_plan === 'object' && (row.year_plan as YearPlan).year
        ? (row.year_plan as YearPlan) : null;
      setYearPlanState(yp);
      loadedIdRef.current = projectId;
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  const upsertField = useCallback(async (field: keyof DetailsRow, value: unknown) => {
    if (!projectId) return;
    const payload = {
      project_id: projectId,
      [field]: value,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase
      .from('company_project_details')
      .upsert(payload, { onConflict: 'project_id' });
    if (error) console.warn('[useProjectDetails] upsert failed:', error.message);
  }, [projectId]);

  const setTeamMembers = useCallback((next: TeamMember[] | ((prev: TeamMember[]) => TeamMember[])) => {
    setTeamMembersState(prev => {
      const value = typeof next === 'function' ? (next as (p: TeamMember[]) => TeamMember[])(prev) : next;
      upsertField('team_members', value);
      return value;
    });
  }, [upsertField]);

  const setTasks = useCallback((next: ProjectTaskDetail[] | ((prev: ProjectTaskDetail[]) => ProjectTaskDetail[])) => {
    setTasksState(prev => {
      const value = typeof next === 'function' ? (next as (p: ProjectTaskDetail[]) => ProjectTaskDetail[])(prev) : next;
      upsertField('tasks', value);
      return value;
    });
  }, [upsertField]);

  const setClientInfo = useCallback((next: ClientInfo | null) => {
    setClientInfoState(next);
    upsertField('client_info', next ?? {});
  }, [upsertField]);

  const setYearPlan = useCallback((next: YearPlan | null) => {
    setYearPlanState(next);
    upsertField('year_plan', next ?? {});
  }, [upsertField]);

  return {
    loading,
    teamMembers, setTeamMembers,
    tasks, setTasks,
    clientInfo, setClientInfo,
    yearPlan, setYearPlan,
  };
}
