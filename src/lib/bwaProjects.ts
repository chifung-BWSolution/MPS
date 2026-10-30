export type BwaLabelRef = {
  id: string;
  label: string | null;
};

export type BwaCustomer = {
  id: string;
  label: string | null;
  customer_name: string | null;
  company_name: string | null;
};

export type BwaCostCentre = {
  id: string;
  label: string | null;
  bu_code: string | null;
};

export type BwaDistrict = {
  id: string;
  label: string | null;
  region_id: string | null;
  region_label: string | null;
};

export type BwaPitching = {
  id: string;
  pitching_code: string | null;
  pitching_stages: string | null;
  estimated_income: number | null;
  estimated_expense: number | null;
};

export type BwaCreatedByUser = {
  id: string;
  email: string | null;
};

/** One row from GET https://bwteam-project.com/api/bwa-projects */
export type BwaProject = {
  id: string;
  project_code: string | null;
  project_name: string | null;
  external_project_name: string | null;
  external_customer_name: string | null;
  description: string | null;
  status: string | null;
  payment_status: string | null;
  estimated_income: number | null;
  estimated_expense: number | null;
  estimated_profit: number | null;
  signed_date: string | null;
  start_date: string | null;
  handover_date: string | null;
  size: string | null;
  actual_size: string | null;
  project_size: string | null;
  site_address: string | null;
  youtube_url: string | null;
  asana_link: string | null;
  working_folder: string | null;
  customer: BwaCustomer | null;
  main_pm: BwaLabelRef | null;
  main_designer: BwaLabelRef | null;
  other_pm: BwaLabelRef | null;
  more_pm: BwaLabelRef | null;
  creator_staff: BwaLabelRef | null;
  modifier_staff: BwaLabelRef | null;
  cost_centre: BwaCostCentre | null;
  financial_year: BwaLabelRef | null;
  team_type: BwaLabelRef | null;
  service_type: BwaLabelRef | null;
  quote_project_type: BwaLabelRef | null;
  service_types: BwaLabelRef[];
  project_types: BwaLabelRef[];
  district: BwaDistrict | null;
  building: BwaLabelRef | null;
  main_contractor: BwaLabelRef | null;
  main_air_supplier: BwaLabelRef | null;
  main_network_supplier: BwaLabelRef | null;
  supplier: BwaLabelRef | null;
  pitching: BwaPitching | null;
  created_by_user: BwaCreatedByUser | null;
};

export type BwaProjectsListResponse = {
  ok: true;
  generated_at: string;
  count: number;
  projects: BwaProject[];
};

export type BwaProjectYoutubeResponse = {
  ok: true;
  project: BwaProject;
};

export type BwaProjectListFilters = {
  search?: string;
  status?: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isBwaProjectId(value: string): boolean {
  return UUID_RE.test(value.trim());
}

function youtubeId(value: string | undefined): boolean {
  return !!value?.trim();
}

/** https YouTube watch, youtu.be, Shorts, live, or embed links. Empty clears the field. */
export function parseYoutubeUrlInput(
  raw: string,
): { ok: true; youtube_url: string | null } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, youtube_url: null };

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, error: '請輸入 https 的 YouTube 連結' };
  }
  if (url.protocol !== 'https:') {
    return { ok: false, error: '請輸入 https 的 YouTube 連結' };
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const isYoutube = host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com';
  const isShort = host === 'youtu.be';
  if (!isYoutube && !isShort) {
    return { ok: false, error: '只接受 YouTube 連結（youtube.com 或 youtu.be）' };
  }

  if (isShort) {
    const id = url.pathname.replace(/^\//, '').split('/')[0];
    if (!youtubeId(id)) return { ok: false, error: '只接受 watch、youtu.be、Shorts、直播或嵌入連結' };
    return { ok: true, youtube_url: trimmed };
  }

  const parts = url.pathname.split('/').filter(Boolean);
  const kind = parts[0];
  if (kind === 'watch' && youtubeId(url.searchParams.get('v') || '')) {
    return { ok: true, youtube_url: trimmed };
  }
  if ((kind === 'shorts' || kind === 'live' || kind === 'embed') && youtubeId(parts[1])) {
    return { ok: true, youtube_url: trimmed };
  }
  return { ok: false, error: '只接受 watch、youtu.be、Shorts、直播或嵌入連結' };
}

export function bwaProjectTitle(project: BwaProject): string {
  return (
    project.project_name?.trim() ||
    project.external_project_name?.trim() ||
    project.project_code?.trim() ||
    project.id
  );
}

export function bwaCustomerLabel(project: BwaProject): string {
  return (
    project.customer?.label?.trim() ||
    project.customer?.company_name?.trim() ||
    project.customer?.customer_name?.trim() ||
    project.external_customer_name?.trim() ||
    ''
  );
}

function searchHaystack(project: BwaProject): string {
  return [
    project.project_code,
    project.project_name,
    project.external_project_name,
    project.external_customer_name,
    project.site_address,
    project.status,
    project.payment_status,
    project.youtube_url,
    bwaCustomerLabel(project),
    project.district?.label,
    project.district?.region_label,
    project.main_pm?.label,
    project.cost_centre?.bu_code,
  ]
    .filter((part): part is string => !!part && part.trim().length > 0)
    .join(' ')
    .toLowerCase();
}

export function filterBwaProjects(projects: BwaProject[], filters: BwaProjectListFilters = {}): BwaProject[] {
  const search = filters.search?.trim().toLowerCase() ?? '';
  const status = filters.status && filters.status !== 'all' ? filters.status : '';
  return projects.filter((project) => {
    if (status && (project.status || '') !== status) return false;
    if (search && !searchHaystack(project).includes(search)) return false;
    return true;
  });
}

export function bwaProjectListMetrics(projects: BwaProject[]) {
  return {
    total: projects.length,
    withYoutube: projects.filter((project) => !!project.youtube_url?.trim()).length,
  };
}

export function bwaStatusOptions(projects: BwaProject[]): string[] {
  return [...new Set(projects.map((project) => project.status?.trim()).filter((status): status is string => !!status))]
    .sort((a, b) => a.localeCompare(b, 'zh-HK'));
}

export function bwaApiErrorMessage(status: number, body: { error?: string; code?: string }): string {
  switch (body.code) {
    case 'service_unavailable':
      return 'PMS 尚未設定 BWA 項目 API 金鑰，或暫時無法連線。';
    case 'unauthorized':
      return 'BWA 項目 API 金鑰不正確。';
    case 'invalid_session':
      return '請先登入後再讀取 BWA 項目。';
    case 'invalid_youtube_url':
      return 'YouTube 連結格式不正確。請使用 https 的 watch、youtu.be、Shorts、直播或嵌入連結。';
    case 'invalid_json':
      return '送出的資料格式不正確。';
    case 'not_found':
      return '找不到這個 BWA 項目。';
    default:
      break;
  }
  if (body.error?.trim()) return body.error.trim();
  return `BWA 項目 API 失敗（${status}）`;
}
