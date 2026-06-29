import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import {
  buildDocumentPath,
  documentPathToUrl,
  filenameToTitle,
  todayDateString,
} from '@/lib/developmentPlanPaths';

export type DevelopmentPlan = {
  id: string;
  planningDate: string;
  title: string;
  owner: string;
  documentPath: string;
  fileName: string;
  documentUrl: string;
  createdAt: string;
};

type DbRow = {
  id: string;
  planning_date: string;
  title: string;
  owner: string;
  document_path: string;
  file_name: string;
  created_at: string;
};

const mapRow = (row: DbRow): DevelopmentPlan => ({
  id: row.id,
  planningDate: row.planning_date,
  title: row.title,
  owner: row.owner,
  documentPath: row.document_path,
  fileName: row.file_name,
  documentUrl: documentPathToUrl(row.document_path),
  createdAt: row.created_at,
});

export type RegisterDevelopmentPlanInput = {
  fileName: string;
  owner: string;
  planningDate?: string;
};

export function useDevelopmentPlans() {
  const { session } = useAuth();
  const [plans, setPlans] = useState<DevelopmentPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPlans = useCallback(async () => {
    setLoading(true);
    const { data, error: fetchError } = await supabase
      .from('development_plan')
      .select('*')
      .order('planning_date', { ascending: false });

    if (fetchError) {
      setError(fetchError.message);
      setPlans([]);
    } else {
      setError(null);
      setPlans((data as DbRow[] | null)?.map(mapRow) ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans, session]);

  const registerPlan = useCallback(
    async ({ fileName, owner, planningDate }: RegisterDevelopmentPlanInput) => {
      const date = planningDate ?? todayDateString();
      const row = {
        planning_date: date,
        title: filenameToTitle(fileName),
        owner,
        document_path: buildDocumentPath(date, fileName),
        file_name: fileName,
      };

      const { data, error: insertError } = await supabase
        .from('development_plan')
        .insert(row)
        .select('*')
        .single();

      if (insertError) {
        return { error: insertError.message, plan: null };
      }

      const plan = mapRow(data as DbRow);
      setPlans((prev) =>
        [plan, ...prev].sort(
          (a, b) =>
            new Date(b.planningDate).getTime() - new Date(a.planningDate).getTime(),
        ),
      );
      return { error: null, plan };
    },
    [],
  );

  return { plans, loading, error, refetch: fetchPlans, registerPlan };
}
