import { useCallback, useEffect, useState } from 'react';
import { fetchBwaProjects, updateBwaProjectYoutube } from '@/lib/bwaProjectsApi';
import type { BwaProject } from '@/lib/bwaProjects';

export function useBwaProjects() {
  const [projects, setProjects] = useState<BwaProject[]>([]);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchBwaProjects();
      setProjects(Array.isArray(result.projects) ? result.projects : []);
      setGeneratedAt(result.generated_at || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '無法讀取 BWA 項目');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const updateYoutube = useCallback(async (id: string, youtubeUrl: string | null) => {
    const result = await updateBwaProjectYoutube(id, youtubeUrl);
    const next = result.project;
    setProjects((prev) => prev.map((project) => (project.id === id ? { ...project, ...next } : project)));
    return next;
  }, []);

  return { projects, generatedAt, loading, error, reload, updateYoutube };
}
