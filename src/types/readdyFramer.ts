export type SourceType = 'github' | 'upload' | 'paste';

export type ReaddyPageKind =
  | 'home'
  | 'page'
  | 'layout-page'
  | 'article'
  | 'locale-mirror'
  | 'not-found'
  | 'single-file';

export type ReaddyPageMigrationStatus =
  | 'pending'
  | 'parsed'
  | 'syncing'
  | 'migrated'
  | 'failed'
  | 'skipped';

export interface ReaddyCssTokens {
  colors: Record<string, string>;
  fontHeading?: string;
  fontBody?: string;
  backgroundHex?: string;
  surfaceHex?: string;
  primaryHex?: string;
  accentHex?: string;
  textHex?: string;
}

export interface ReaddyDiscoveredPage {
  id: string;
  path: string;
  title: string;
  description?: string;
  locale: string;
  pageKind: ReaddyPageKind;
  componentName: string;
  sourceFile: string;
  wrapperComponent?: string;
  articleSlug?: string;
  articleLang?: string;
  sectionHints?: string[];
  category?: string;
  migrationStatus: ReaddyPageMigrationStatus;
  jobId?: string | null;
  sectionCount?: number;
  framerPageNodeId?: string | null;
  lastSyncedAt?: string | null;
}

export interface ReaddyProjectAnalysis {
  projectKey: string;
  projectName: string;
  sourceOrigin?: string;
  sourceType: SourceType;
  framework: string;
  routerFile: string | null;
  totalFiles: number;
  pages: ReaddyDiscoveredPage[];
  localeCounts: Record<string, number>;
  kindCounts: Record<string, number>;
  sharedFiles: {
    navbar?: string;
    footer?: string;
    pageLayout?: string;
    indexCss?: string;
    tailwindConfig?: string;
    seoData?: string;
  };
  cssTokens: ReaddyCssTokens;
  tailwindConfig: string | null;
  githubMeta?: {
    owner: string;
    repo: string;
    full_name: string;
    branch: string;
    default_branch: string;
    branches: string[];
    is_private: boolean;
  };
  storageBundlePath?: string | null;
  assetUrlMap?: Record<string, string>;
  uploadedAssetCount?: number;
}

export interface FramerIrPageMeta {
  path: string;
  title: string;
  locale?: string;
  pageKind?: string;
  sourceFile?: string;
  includedFiles?: string[];
  framerPageNodeId?: string | null;
}

export interface GridConfig {
  desktop_width: number;
  container_max_width: number;
  columns: number;
  gutter: number;
}

export interface GitHubRepoMeta {
  repo: string;
  branch: string;
  file_path: string;
  commit_sha: string;
  is_private?: boolean;
}

export interface GitHubRepoSummary {
  id: number;
  name: string;
  full_name: string;
  owner: string;
  html_url: string;
  default_branch: string;
  is_private: boolean;
  updated_at: string;
  pushed_at?: string | null;
  description?: string | null;
}

export interface GitHubInspectResult {
  owner: string;
  repo: string;
  full_name: string;
  is_private: boolean;
  default_branch: string;
  branch: string;
  branches: string[];
  files: string[];
  suggested_file: string;
  tailwind_config_path: string | null;
}

export interface GitHubFileFetchResult {
  file_path: string;
  file_name: string;
  code: string;
  commit_sha: string;
  tailwind_config: string | null;
  repo_meta: GitHubRepoMeta;
}

export interface FramerIrButton {
  label: string;
  variant: 'primary' | 'secondary' | 'ghost';
  href?: string;
}

export interface FramerIrCard {
  title: string;
  description: string;
  tag?: string;
  icon?: string;
  imageUrl?: string;
  tagline?: string;
  href?: string;
}

export interface FramerIrNavLink {
  label: string;
  href?: string;
}

export interface FramerIrElement {
  badge?: string;
  heading?: string;
  brandSubtitle?: string;
  subheading?: string;
  paragraphs?: string[];
  buttons?: FramerIrButton[];
  navLinks?: Array<string | FramerIrNavLink>;
  footerColumns?: Array<{ title: string; links: FramerIrNavLink[] }>;
  footerLead?: {
    tagline?: string;
    contactTitle?: string;
    contactLines?: FramerIrNavLink[];
    quickTitle?: string;
    quickLinks?: FramerIrNavLink[];
    company?: string;
  };
  logos?: string[];
  cards?: FramerIrCard[];
  stats?: Array<{ label: string; value: string }>;
  imageUrl?: string;
  backgroundImage?: string;
  overlay?: string;
}

export interface FramerIrSection {
  id: string;
  step: number;
  name: string;
  sectionKind: 'navbar' | 'hero' | 'logos' | 'features' | 'content' | 'cta' | 'footer';
  framerType: 'Stack' | 'Grid' | 'Frame';
  direction: 'horizontal' | 'vertical';
  gridSpan: string;
  columns: number;
  gap: number;
  padding: string;
  background: string;
  textColor: string;
  accentColor: string;
  elements: FramerIrElement;
  interactivePlaceholders: string[];
  framerNodeSpec: {
    component: string;
    width: string;
    maxWidth: number;
    layout: string;
    distribution: string;
    alignment: string;
    gap: number;
    borderRadius: number;
    fills: string[];
  };
  syncStatus: 'pending' | 'syncing' | 'synced' | 'failed';
}

export interface FramerIrDesignTokens {
  colors: Record<string, string>;
  typography: {
    fontFamily: string;
    bodyFont?: string;
    h1Size: number;
    h2Size: number;
    bodySize: number;
  };
  radius: {
    sm: number;
    md: number;
    lg: number;
  };
}

export interface FramerIrPayload {
  version: '1.2';
  renderedPage?: { url: string; images: Record<'desktop' | 'tablet' | 'phone', string>; limitations: string[] };
  pageMeta?: FramerIrPageMeta;
  sourceSummary: {
    framework: string;
    styling: string;
    sectionCount: number;
  };
  gridConfig: GridConfig;
  designTokens: FramerIrDesignTokens;
  sections: FramerIrSection[];
}

export interface WorkbenchLogEntry {
  ts: string;
  level: 'info' | 'success' | 'warn' | 'error' | string;
  stage: string;
  message: string;
}

export interface FramerSyncJob {
  id: string;
  source_type: SourceType;
  github_repo_meta: GitHubRepoMeta | null;
  storage_bundle_path: string | null;
  framer_project_url: string;
  page_path?: string | null;
  page_title?: string | null;
  project_name?: string | null;
  grid_config: GridConfig;
  raw_readdy_code: string;
  ir_payload: FramerIrPayload | null;
  current_step: number;
  status: 'pending' | 'parsed' | 'syncing' | 'completed' | 'failed';
  step_logs: WorkbenchLogEntry[];
  error_log: string | null;
  created_at: string;
  updated_at?: string;
}

/** One imported website: the uploaded source, not a single page analysis. */
export interface FramerSiteSnapshot {
  id: string;
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
  page_count: number;
  created_at: string;
}

export interface FramerWorkspaceSummary {
  id: string;
  name: string;
  role: string | null;
  plan: string | null;
  canCreate: boolean;
}

export interface FramerProjectSummary {
  id: string;
  title: string;
  url: string;
  workspaceId: string | null;
  workspaceName: string | null;
  lastOpenedAt: string | null;
}

export interface FramerOAuthStatus {
  connected: boolean;
  token_preview: string;
  expires_at: string | null;
  connected_at: string | null;
  last_used_at: string | null;
  redirect_uri: string;
  client_id: string | null;
  github_configured: boolean;
  github_login?: string | null;
  github_token_preview: string;
  github_source: 'stored' | 'env' | null;
  /** When omitted by an older server, the workbench treats Publish as on. */
  auto_publish?: boolean;
}

export type ExecutionStageKey = 'ast' | 'grid' | 'tokens' | 'mcp';

export interface ExecutionStageState {
  key: ExecutionStageKey;
  code: string;
  label: string;
  progress: number;
  status: 'idle' | 'running' | 'done' | 'error';
  detail: string;
}
