import JSZip from 'jszip';
import type { SceneNode } from '@/lib/readdySceneGraph';
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
  FramerSiteSnapshot,
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

export interface FramerMcpSessionHint {
  project_id: string;
  mcp_session_id?: string | null;
  project_session: string;
}

export function isFramerSessionLimitError(message: string): boolean {
  return /active session limit|do not retry now|同時開啟工作階段上限|等待至少\s*360\s*秒|等待至少\s*6\s*分鐘/i.test(
    String(message || ''),
  );
}

export async function syncFramerStep(params: {
  job_id: string;
  step_index: number;
  framer_project_url?: string;
  page_path?: string;
  page_title?: string;
  session_slot?: number;
  mcp_session?: FramerMcpSessionHint | null;
  scene?: SceneNode;
}): Promise<{
  ok: boolean;
  step_index: number;
  section_id?: string;
  page_path?: string;
  framer_page_node_id?: string | null;
  duration_ms: number;
  tools_discovered: string[];
  tool_called: string | null;
  mcp_session?: FramerMcpSessionHint | null;
  session_reused?: boolean;
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

const SITE_RECORD_KEY = 'mps-readdy-framer-recorded-site-keys';
const LOCAL_SITES_KEY = 'mps-readdy-framer-site-snapshots';
const LOCAL_SITE_LIMIT = 12;

function browserStorage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export function isFramerSiteRecorded(projectKey: string): boolean {
  const storage = browserStorage();
  if (!storage) return false;
  try {
    const raw = storage.getItem(SITE_RECORD_KEY);
    const keys = raw ? (JSON.parse(raw) as string[]) : [];
    return Array.isArray(keys) && keys.includes(projectKey);
  } catch {
    return false;
  }
}

export function markFramerSiteRecorded(projectKey: string): void {
  const storage = browserStorage();
  if (!storage || !projectKey) return;
  try {
    const raw = storage.getItem(SITE_RECORD_KEY);
    const keys = raw ? (JSON.parse(raw) as string[]) : [];
    const next = Array.isArray(keys) ? keys.filter((key) => key !== projectKey) : [];
    next.push(projectKey);
    storage.setItem(SITE_RECORD_KEY, JSON.stringify(next.slice(-100)));
  } catch {
    // ignore quota / private mode
  }
}

function readLocalSiteSnapshots(): FramerSiteSnapshot[] {
  const storage = browserStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(LOCAL_SITES_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown[]) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row) => normalizeSiteSnapshot(row))
      .filter((row): row is FramerSiteSnapshot => Boolean(row));
  } catch {
    return [];
  }
}

function writeLocalSiteSnapshots(rows: FramerSiteSnapshot[]): void {
  const storage = browserStorage();
  if (!storage) return;
  try {
    storage.setItem(LOCAL_SITES_KEY, JSON.stringify(rows.slice(0, LOCAL_SITE_LIMIT)));
  } catch {
    // The page list can be large; drop oldest rows and try once more.
    try {
      storage.setItem(LOCAL_SITES_KEY, JSON.stringify(rows.slice(0, 3)));
    } catch {
      // ignore quota
    }
  }
}

function normalizeSiteSnapshot(row: unknown): FramerSiteSnapshot | null {
  if (!row || typeof row !== 'object') return null;
  const record = row as Record<string, unknown>;
  const analysis = record.analysis as ReaddyProjectAnalysis | null;
  if (!analysis || typeof analysis !== 'object' || !Array.isArray(analysis.pages)) return null;
  const sourceType =
    record.source_type === 'github' || record.source_type === 'upload' || record.source_type === 'paste'
      ? record.source_type
      : analysis.sourceType;
  const paths = record.github_all_paths;
  return {
    id: String(record.id || ''),
    project_key: String(record.project_key || analysis.projectKey || ''),
    project_name: String(record.project_name || analysis.projectName || '未命名網站'),
    source_type: sourceType,
    source_label: record.source_label ? String(record.source_label) : null,
    framer_project_url: record.framer_project_url ? String(record.framer_project_url) : null,
    github_repo_url: record.github_repo_url ? String(record.github_repo_url) : null,
    github_branch: record.github_branch ? String(record.github_branch) : null,
    github_all_paths: Array.isArray(paths) ? paths.map(String) : [],
    storage_bundle_path: record.storage_bundle_path ? String(record.storage_bundle_path) : null,
    analysis,
    page_count: Number(record.page_count || analysis.pages.length || 0),
    created_at: String(record.created_at || new Date().toISOString()),
  };
}

export async function listFramerSiteSnapshots(limit = 20): Promise<FramerSiteSnapshot[]> {
  const local = readLocalSiteSnapshots();
  const { data, error } = await supabase
    .from('framer_site_snapshots')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return local.slice(0, limit);
  const remote = (data || [])
    .map((row) => normalizeSiteSnapshot(row))
    .filter((row): row is FramerSiteSnapshot => Boolean(row));
  const seen = new Set(remote.map((row) => row.id));
  const merged = [...remote];
  for (const row of local) {
    if (!seen.has(row.id)) merged.push(row);
  }
  merged.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  return merged.slice(0, limit);
}

export async function saveFramerSiteSnapshot(input: {
  project_key: string;
  project_name: string;
  source_type: SourceType;
  source_label: string | null;
  framer_project_url: string | null;
  github_repo_url: string | null;
  github_branch: string | null;
  github_all_paths: string[];
  storage_bundle_path: string | null;
  analysis: ReaddyProjectAnalysis;
}): Promise<FramerSiteSnapshot> {
  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const createdAt = new Date().toISOString();
  const snapshot: FramerSiteSnapshot = {
    id,
    project_key: input.project_key,
    project_name: input.project_name,
    source_type: input.source_type,
    source_label: input.source_label,
    framer_project_url: input.framer_project_url,
    github_repo_url: input.github_repo_url,
    github_branch: input.github_branch,
    github_all_paths: input.github_all_paths,
    storage_bundle_path: input.storage_bundle_path,
    analysis: input.analysis,
    page_count: input.analysis.pages.length,
    created_at: createdAt,
  };

  const { data: userData } = await supabase.auth.getUser();
  const { error } = await supabase.from('framer_site_snapshots').insert({
    id,
    user_id: userData.user?.id ?? null,
    project_key: snapshot.project_key,
    project_name: snapshot.project_name,
    source_type: snapshot.source_type,
    source_label: snapshot.source_label,
    framer_project_url: snapshot.framer_project_url,
    github_repo_url: snapshot.github_repo_url,
    github_branch: snapshot.github_branch,
    github_all_paths: snapshot.github_all_paths,
    storage_bundle_path: snapshot.storage_bundle_path,
    analysis: snapshot.analysis,
    page_count: snapshot.page_count,
    created_at: createdAt,
  });

  if (error) {
    const local = [snapshot, ...readLocalSiteSnapshots().filter((row) => row.id !== snapshot.id)];
    writeLocalSiteSnapshots(local);
  }
  return snapshot;
}

function shouldSkipZipEntry(lowerPath: string): boolean {
  return (
    lowerPath.includes('node_modules/') ||
    lowerPath.startsWith('dist/') ||
    lowerPath.includes('__macosx/') ||
    lowerPath.endsWith('package-lock.json')
  );
}

function isZipCodeEntry(lowerPath: string): boolean {
  return /\.(tsx|ts|jsx|js|css|html|json)$/i.test(lowerPath) && !lowerPath.endsWith('.d.ts');
}

async function readZipCodeFileMap(zip: JSZip): Promise<Record<string, string>> {
  const rawFileMap: Record<string, string> = {};
  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue;
    const path = entry.name.replace(/^\/+/, '');
    const lower = path.toLowerCase();
    if (shouldSkipZipEntry(lower) || !isZipCodeEntry(lower)) continue;
    rawFileMap[path] = await entry.async('string');
  }
  return normalizeProjectFileMap(rawFileMap);
}

export async function loadUploadedReaddyFileMap(
  storagePath: string,
): Promise<Record<string, string> | null> {
  try {
    const { data, error } = await supabase.storage.from(ASSETS_BUCKET).download(storagePath);
    if (error || !data) return null;
    const zip = await JSZip.loadAsync(data);
    const fileMap = await readZipCodeFileMap(zip);
    return Object.keys(fileMap).length > 0 ? fileMap : null;
  } catch {
    return null;
  }
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

  const fileMap = await readZipCodeFileMap(zip);
  const assetUrlMap: Record<string, string> = {};
  let uploadedAssetCount = 0;

  const entries = Object.values(zip.files).filter((entry) => !entry.dir);

  for (const entry of entries) {
    const p = entry.name.replace(/^\/+/, '');
    const lower = p.toLowerCase();
    if (shouldSkipZipEntry(lower) || isZipCodeEntry(lower)) continue;

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
