import JSZip from 'jszip';
import { supabase } from '@/lib/supabase';
import {
  analyzeReaddyFileMap,
  normalizeProjectFileMap,
} from '@/lib/readdyProjectAnalyzer';
import type {
  FramerIrPageMeta,
  FramerIrPayload,
  FramerOAuthStatus,
  FramerProjectSummary,
  FramerSyncJob,
  FramerWorkspaceSummary,
  GitHubFileFetchResult,
  GitHubInspectResult,
  GitHubRepoMeta,
  GitHubRepoSummary,
  GridConfig,
  ReaddyCssTokens,
  ReaddyDiscoveredPage,
  ReaddyProjectAnalysis,
  SourceType,
  WorkbenchLogEntry,
} from '@/types/readdyFramer';

export const FRAMER_OAUTH_MESSAGE = 'mps-framer-oauth';
const ASSETS_BUCKET = 'readdy-framer-assets';

async function getEdgeHeaders(): Promise<{
  supabaseUrl: string;
  headers: Record<string, string>;
}> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token || supabaseAnonKey;
  if (!supabaseUrl || !token) {
    throw new Error('缺少 Supabase 環境設定，無法呼叫雲端服務。');
  }
  return {
    supabaseUrl: supabaseUrl.replace(/\/+$/, ''),
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: supabaseAnonKey,
      'Content-Type': 'application/json',
    },
  };
}

async function invokeEdgeJson<T>(
  functionName: string,
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  const { supabaseUrl, headers } = await getEdgeHeaders();
  const res = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok || (json && typeof json === 'object' && 'error' in json && json.error)) {
    const msg =
      (json as { error?: string })?.error || `${res.status} ${res.statusText}`;
    throw new Error(msg);
  }
  return json;
}

export function isValidFramerProjectUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  try {
    const u = new URL(trimmed);
    return (
      u.protocol === 'https:' &&
      /(^|\.)framer\.com$/i.test(u.hostname) &&
      u.pathname.includes('/projects/')
    );
  } catch {
    return false;
  }
}

export async function getFramerOAuthStatus(): Promise<FramerOAuthStatus> {
  return invokeEdgeJson<FramerOAuthStatus>('framer-oauth', { action: 'status' });
}

export async function startFramerOAuth(): Promise<{
  authorization_url: string;
  redirect_uri: string;
}> {
  return invokeEdgeJson<{ authorization_url: string; redirect_uri: string }>(
    'framer-oauth',
    {
      action: 'start',
      return_origin: typeof window !== 'undefined' ? window.location.origin : undefined,
    },
  );
}

export async function disconnectFramerOAuth(): Promise<FramerOAuthStatus> {
  return invokeEdgeJson<FramerOAuthStatus>('framer-oauth', {
    action: 'disconnect',
  });
}

export async function saveTeamGitHubToken(
  token: string,
): Promise<FramerOAuthStatus & { ok: boolean; github_login?: string | null }> {
  return invokeEdgeJson<FramerOAuthStatus & { ok: boolean; github_login?: string | null }>(
    'framer-oauth',
    { action: 'save_github_token', token },
  );
}

export async function listGitHubRepos(params?: {
  github_token?: string;
}): Promise<{
  configured: boolean;
  repos: GitHubRepoSummary[];
  message?: string;
}> {
  return invokeEdgeJson('readdy-github-fetch', {
    action: 'list_repos',
    ...(params || {}),
  });
}

export async function listGitHubBranches(params: {
  repo_url: string;
  github_token?: string;
}): Promise<{
  full_name: string;
  default_branch: string;
  branches: string[];
}> {
  return invokeEdgeJson('readdy-github-fetch', {
    action: 'list_branches',
    ...params,
  });
}

export async function inspectGitHubRepo(params: {
  repo_url: string;
  branch?: string;
  github_token?: string;
}): Promise<GitHubInspectResult> {
  return invokeEdgeJson<GitHubInspectResult>('readdy-github-fetch', {
    action: 'inspect',
    ...params,
  });
}

export async function fetchGitHubFile(params: {
  repo_url: string;
  branch?: string;
  file_path: string;
  github_token?: string;
}): Promise<GitHubFileFetchResult> {
  return invokeEdgeJson<GitHubFileFetchResult>('readdy-github-fetch', {
    action: 'fetch_file',
    ...params,
  });
}

export async function analyzeGitHubProject(params: {
  repo_url: string;
  branch?: string;
  github_token?: string;
}): Promise<{
  analysis: ReaddyProjectAnalysis;
  commit_sha: string;
  all_paths: string[];
}> {
  return invokeEdgeJson('readdy-github-fetch', {
    action: 'analyze_project',
    ...params,
  });
}

export async function fetchGitHubPageBundle(params: {
  repo_url: string;
  branch?: string;
  page: ReaddyDiscoveredPage;
  shared_files: ReaddyProjectAnalysis['sharedFiles'];
  all_paths?: string[];
  github_token?: string;
}): Promise<{
  code: string;
  included_files: string[];
  summary: string;
  commit_sha: string;
  repo_meta: GitHubRepoMeta;
}> {
  return invokeEdgeJson('readdy-github-fetch', {
    action: 'fetch_page_bundle',
    ...params,
  });
}

export async function parseReaddyToIr(params: {
  framer_project_url: string;
  source_type: SourceType;
  github_repo_meta?: GitHubRepoMeta | null;
  storage_bundle_path?: string | null;
  grid_config: GridConfig;
  raw_readdy_code: string;
  tailwind_config?: string | null;
  asset_url_map?: Record<string, string>;
  page_meta?: FramerIrPageMeta;
  css_tokens?: ReaddyCssTokens;
  project_name?: string;
}): Promise<{
  job_id: string;
  created_at: string;
  parser_engine: 'gemini' | 'grok' | 'ast-fallback';
  ir_payload: FramerIrPayload;
  logs: WorkbenchLogEntry[];
}> {
  return invokeEdgeJson('readdy-parse-ir', params);
}

export async function listFramerCatalog(): Promise<{
  workspaces: FramerWorkspaceSummary[];
  projects: FramerProjectSummary[];
  truncated: boolean;
}> {
  return invokeEdgeJson('framer-mcp-sync', { action: 'list_framer_catalog' });
}

export async function createFramerProject(params: {
  title: string;
  workspace_id: string;
}): Promise<FramerProjectSummary> {
  const result = await invokeEdgeJson<{ ok: boolean; project: FramerProjectSummary }>(
    'framer-mcp-sync',
    { action: 'create_framer_project', ...params },
  );
  return result.project;
}

export async function syncFramerStep(params: {
  job_id: string;
  step_index: number;
  framer_project_url?: string;
  page_path?: string;
  page_title?: string;
}): Promise<{
  ok: boolean;
  step_index: number;
  section_id?: string;
  page_path?: string;
  framer_page_node_id?: string | null;
  duration_ms: number;
  tools_discovered: string[];
  tool_called: string | null;
  logs: WorkbenchLogEntry[];
  job_status: string;
}> {
  return invokeEdgeJson('framer-mcp-sync', params);
}

export async function listRecentFramerJobs(limit = 20): Promise<FramerSyncJob[]> {
  const { data, error } = await supabase
    .from('framer_sync_jobs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    throw new Error(`讀取歷史同步任務失敗：${error.message}`);
  }
  return (data || []) as FramerSyncJob[];
}

function guessMimeType(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  switch (ext) {
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    case 'svg':
      return 'image/svg+xml';
    case 'gif':
      return 'image/gif';
    case 'zip':
      return 'application/zip';
    default:
      return 'application/octet-stream';
  }
}

export interface UnpackedProjectResult {
  analysis: ReaddyProjectAnalysis;
  fileMap: Record<string, string>;
}

export async function processUploadedReaddyFile(
  file: File,
): Promise<UnpackedProjectResult> {
  const lowerName = file.name.toLowerCase();

  if (!lowerName.endsWith('.zip')) {
    const code = await file.text();
    const fileMap = normalizeProjectFileMap({ [file.name]: code });
    const analysis = analyzeReaddyFileMap(fileMap, {
      sourceType: 'upload',
      projectName: file.name.replace(/\.[^.]+$/, ''),
    });
    return { analysis, fileMap };
  }

  const zip = await JSZip.loadAsync(file);
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const bundleStoragePath = `bundles/${stamp}/${file.name.replace(/[^\w.-]/g, '_')}`;

  // Upload original zip bundle (best-effort if bucket exists & authenticated)
  let uploadedBundlePath: string | null = null;
  try {
    const { error: bundleErr } = await supabase.storage
      .from(ASSETS_BUCKET)
      .upload(bundleStoragePath, file, {
        contentType: 'application/zip',
        upsert: true,
      });
    if (!bundleErr) {
      uploadedBundlePath = bundleStoragePath;
    }
  } catch {
    // ignore storage failures so local analysis never blocks
  }

  const rawFileMap: Record<string, string> = {};
  const assetUrlMap: Record<string, string> = {};
  let uploadedAssetCount = 0;

  const entries = Object.values(zip.files).filter((entry) => !entry.dir);

  for (const entry of entries) {
    const p = entry.name.replace(/^\/+/, '');
    const lower = p.toLowerCase();
    if (
      lower.includes('node_modules/') ||
      lower.startsWith('dist/') ||
      lower.includes('__macosx/') ||
      lower.endsWith('package-lock.json')
    ) {
      continue;
    }

    if (
      /\.(tsx|ts|jsx|js|css|html|json)$/i.test(lower) &&
      !lower.endsWith('.d.ts')
    ) {
      rawFileMap[p] = await entry.async('string');
      continue;
    }

    if (/\.(png|jpe?g|webp|svg|gif)$/i.test(lower)) {
      try {
        const blob = await entry.async('blob');
        const cleanRel = p.replace(/[^\w./-]/g, '_');
        const assetPath = `assets/${stamp}/${cleanRel}`;
        const { error: imgErr } = await supabase.storage
          .from(ASSETS_BUCKET)
          .upload(assetPath, blob, {
            contentType: guessMimeType(p),
            upsert: true,
          });
        if (!imgErr) {
          const { data: pub } = supabase.storage
            .from(ASSETS_BUCKET)
            .getPublicUrl(assetPath);
          if (pub?.publicUrl) {
            uploadedAssetCount += 1;
            const baseName = p.split('/').pop() || p;
            assetUrlMap[p] = pub.publicUrl;
            assetUrlMap[`/${p}`] = pub.publicUrl;
            assetUrlMap[`./${p}`] = pub.publicUrl;
            assetUrlMap[baseName] = pub.publicUrl;
          }
        }
      } catch {
        // best-effort image upload
      }
    }
  }

  const fileMap = normalizeProjectFileMap(rawFileMap);
  if (Object.keys(fileMap).length === 0) {
    throw new Error('ZIP 壓縮包內找不到任何可分析的程式碼檔案。');
  }

  const analysis = analyzeReaddyFileMap(fileMap, {
    sourceType: 'upload',
    projectName: file.name.replace(/\.zip$/i, ''),
    storageBundlePath: uploadedBundlePath,
    assetUrlMap,
    uploadedAssetCount,
  });

  if (analysis.pages.length === 0) {
    throw new Error('已讀取壓縮包，但未能識別出任何頁面路由或組件檔案。');
  }

  return {
    analysis,
    fileMap,
  };
}
