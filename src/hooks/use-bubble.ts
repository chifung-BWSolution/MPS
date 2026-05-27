import { useState, useEffect, useCallback } from 'react';
import { bubbleGet, bubbleGetById, bubbleCreate, bubbleUpdate, bubbleDelete, bubbleGetAll } from '@/lib/bubble-api';
import type { BubbleQueryParams } from '@/lib/bubble-api';

interface UseBubbleState<T> {
  data: T[];
  loading: boolean;
  error: string | null;
  total: number;
  remaining: number;
}

/**
 * React hook for fetching Bubble.io data
 * 
 * Usage:
 * ```tsx
 * const { data, loading, error, refetch } = useBubble<Project>('project', {
 *   constraints: [{ key: 'status', constraint_type: 'equals', value: 'active' }],
 *   sort_field: 'Created Date',
 *   descending: true,
 *   limit: 50,
 * });
 * ```
 */
export function useBubble<T = any>(
  dataType: string,
  params?: BubbleQueryParams,
  options?: { enabled?: boolean; fetchAll?: boolean }
) {
  const [state, setState] = useState<UseBubbleState<T>>({
    data: [],
    loading: true,
    error: null,
    total: 0,
    remaining: 0,
  });

  const enabled = options?.enabled !== false;
  const fetchAllPages = options?.fetchAll ?? false;

  const fetchData = useCallback(async () => {
    if (!enabled) return;

    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      if (fetchAllPages) {
        const results = await bubbleGetAll<T>(dataType, params);
        setState({
          data: results,
          loading: false,
          error: null,
          total: results.length,
          remaining: 0,
        });
      } else {
        const response = await bubbleGet<T>(dataType, params);
        setState({
          data: response.response.results,
          loading: false,
          error: null,
          total: response.response.count,
          remaining: response.response.remaining,
        });
      }
    } catch (err: any) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: err.message || 'Failed to fetch data from Bubble',
      }));
    }
  }, [dataType, JSON.stringify(params), enabled, fetchAllPages]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    ...state,
    refetch: fetchData,
  };
}

/**
 * React hook for fetching a single Bubble.io record by ID
 * 
 * Usage:
 * ```tsx
 * const { data, loading, error } = useBubbleRecord<Project>('project', projectId);
 * ```
 */
export function useBubbleRecord<T = any>(
  dataType: string,
  id: string | null | undefined
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(!!id);
  const [error, setError] = useState<string | null>(null);

  const fetchRecord = useCallback(async () => {
    if (!id) {
      setData(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await bubbleGetById<T>(dataType, id);
      setData(response.response);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch record');
    } finally {
      setLoading(false);
    }
  }, [dataType, id]);

  useEffect(() => {
    fetchRecord();
  }, [fetchRecord]);

  return { data, loading, error, refetch: fetchRecord };
}

/**
 * React hook for Bubble.io mutations (create, update, delete)
 * 
 * Usage:
 * ```tsx
 * const { create, update, remove, loading, error } = useBubbleMutation<Project>('project');
 * 
 * await create({ name: 'New Project', status: 'active' });
 * await update('record_id', { status: 'completed' });
 * await remove('record_id');
 * ```
 */
export function useBubbleMutation<T extends Record<string, any>>(dataType: string) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = useCallback(async (data: T) => {
    setLoading(true);
    setError(null);
    try {
      const result = await bubbleCreate(dataType, data);
      return result;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [dataType]);

  const update = useCallback(async (id: string, data: Partial<T>) => {
    setLoading(true);
    setError(null);
    try {
      await bubbleUpdate(dataType, id, data);
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [dataType]);

  const remove = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      await bubbleDelete(dataType, id);
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [dataType]);

  return { create, update, remove, loading, error };
}
