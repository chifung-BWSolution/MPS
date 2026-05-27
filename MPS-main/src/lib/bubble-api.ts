/**
 * Bubble.io Data API Client (via Supabase Edge Function Proxy)
 * 
 * Routes all Bubble API calls through the Supabase Edge Function `bubble-proxy`
 * to keep the API key server-side and avoid CORS issues.
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const PROXY_URL = `${SUPABASE_URL}/functions/v1/supabase-functions-bubble-proxy`;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('[Bubble API] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY environment variables.');
}

// ============================
// Types
// ============================

export interface BubbleResponse<T> {
  response: {
    cursor: number;
    results: T[];
    count: number;
    remaining: number;
  };
}

export interface BubbleSingleResponse<T> {
  response: T;
}

export interface BubbleConstraint {
  key: string;
  constraint_type: 
    | 'equals' 
    | 'not equal' 
    | 'is_empty' 
    | 'is_not_empty' 
    | 'text contains' 
    | 'not text contains'
    | 'greater than' 
    | 'less than' 
    | 'in' 
    | 'not in'
    | 'contains'
    | 'not contains';
  value?: any;
}

export interface BubbleQueryParams {
  constraints?: BubbleConstraint[];
  sort_field?: string;
  descending?: boolean;
  limit?: number;
  cursor?: number;
}

// ============================
// Core API Functions (via Proxy)
// ============================

/**
 * Call the Supabase Edge Function proxy
 */
async function callProxy(payload: {
  dataType: string;
  method?: string;
  params?: BubbleQueryParams;
  id?: string;
  body?: any;
}): Promise<any> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Missing Supabase configuration for Bubble proxy');
  }

  let response: Response;
  try {
    response = await fetch(PROXY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'apikey': SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(payload),
    });
  } catch (err: any) {
    throw new Error(`Network error calling Bubble proxy: ${err.message}`);
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(errorData.error || `Proxy error (${response.status})`);
  }

  return response.json();
}

/**
 * GET - Fetch a list of records from a Bubble data type
 * @param dataType - The Bubble data type name (e.g., 'Staff', 'project', 'company')
 * @param params - Query parameters (constraints, sort, pagination)
 */
export async function bubbleGet<T = any>(
  dataType: string,
  params?: BubbleQueryParams
): Promise<BubbleResponse<T>> {
  return callProxy({ dataType, method: 'GET', params });
}

/**
 * GET - Fetch a single record by ID
 * @param dataType - The Bubble data type name
 * @param id - The unique ID of the record
 */
export async function bubbleGetById<T = any>(
  dataType: string,
  id: string
): Promise<BubbleSingleResponse<T>> {
  return callProxy({ dataType, method: 'GET', id });
}

/**
 * POST - Create a new record in a Bubble data type
 * @param dataType - The Bubble data type name
 * @param data - The fields to set on the new record
 * @returns The ID of the created record
 */
export async function bubbleCreate<T extends Record<string, any>>(
  dataType: string,
  data: T
): Promise<{ id: string; status: string }> {
  return callProxy({ dataType, method: 'POST', body: data });
}

/**
 * PATCH - Modify an existing record
 * @param dataType - The Bubble data type name
 * @param id - The unique ID of the record to update
 * @param data - The fields to update
 */
export async function bubbleUpdate<T extends Record<string, any>>(
  dataType: string,
  id: string,
  data: Partial<T>
): Promise<void> {
  await callProxy({ dataType, method: 'PATCH', id, body: data });
}

/**
 * DELETE - Remove a record
 * @param dataType - The Bubble data type name
 * @param id - The unique ID of the record to delete
 */
export async function bubbleDelete(
  dataType: string,
  id: string
): Promise<void> {
  await callProxy({ dataType, method: 'DELETE', id });
}

/**
 * Bulk fetch - handles pagination automatically to get all records
 * @param dataType - The Bubble data type name
 * @param params - Query parameters (constraints, sort)
 * @param maxRecords - Maximum records to fetch (default: 1000)
 */
export async function bubbleGetAll<T = any>(
  dataType: string,
  params?: Omit<BubbleQueryParams, 'cursor' | 'limit'>,
  maxRecords: number = 1000
): Promise<T[]> {
  const allResults: T[] = [];
  let cursor = 0;
  const pageSize = 100; // Bubble's max per request

  while (allResults.length < maxRecords) {
    const response = await bubbleGet<T>(dataType, {
      ...params,
      limit: pageSize,
      cursor,
    });

    allResults.push(...response.response.results);

    if (response.response.remaining === 0) break;
    cursor += pageSize;
  }

  return allResults.slice(0, maxRecords);
}

// ============================
// React Hook Helper
// ============================

/**
 * Helper to create a typed API client for a specific data type
 * Usage: const projectsApi = createBubbleClient<Project>('project');
 */
export function createBubbleClient<T extends Record<string, any>>(dataType: string) {
  return {
    getAll: (params?: BubbleQueryParams) => bubbleGet<T>(dataType, params),
    getById: (id: string) => bubbleGetById<T>(dataType, id),
    create: (data: T) => bubbleCreate(dataType, data),
    update: (id: string, data: Partial<T>) => bubbleUpdate<T>(dataType, id, data),
    delete: (id: string) => bubbleDelete(dataType, id),
    fetchAll: (params?: Omit<BubbleQueryParams, 'cursor' | 'limit'>, max?: number) => 
      bubbleGetAll<T>(dataType, params, max),
  };
}
