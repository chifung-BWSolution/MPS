import type {
  AltImageCandidate,
  AltKeywordOption,
  AltPageContext,
  AltRunRow,
  AltSettingsRow,
  AltSuggestionRow,
  AltUsageSummary,
} from '@/lib/altTypes.ts';
import { evaluateAlt } from '@/lib/altQuality.ts';
import { truncateText } from '@/lib/altText.ts';
import type { WebsiteProfileFull } from '@/types/app';

function svgImage(options: {
  title: string;
  subtitle: string;
  from: string;
  to: string;
  width?: number;
  height?: number;
}): string {
  const width = options.width ?? 640;
  const height = options.height ?? 400;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${options.from}" />
      <stop offset="100%" stop-color="${options.to}" />
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#g)" />
  <circle cx="${width * 0.82}" cy="${height * 0.2}" r="${width * 0.16}" fill="rgba(255,255,255,0.10)" />
  <rect x="40" y="${height - 118}" width="72" height="6" rx="3" fill="rgba(255,255,255,0.8)" />
  <text x="40" y="${height - 66}" font-family="'PingFang TC','Microsoft JhengHei',sans-serif" font-size="34" font-weight="700" fill="#ffffff">${options.title}</text>
  <text x="40" y="${height - 30}" font-family="'PingFang TC','Microsoft JhengHei',sans-serif" font-size="18" fill="rgba(255,255,255,0.75)">${options.subtitle}</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export const DEMO_SITES: WebsiteProfileFull[] = [
  {
    id: 'demo-bw',
    companyId: 'demo-co',
    brandId: 'demo-brand',
    websiteName: 'BW Interior 志豐設計工程（示範）',
    domainUrl: 'https://demo.local',
    platform: 'framer',
    company: 'BWD',
    brand: 'BW',
    level: 1,
    status: 'live',
    pagesCount: 24,
    articlesCount: 12,
    videosCount: 3,
    socialPostsCount: 0,
    keywordsCount: 18,
    pluginsCount: 0,
    totalHours: 0,
    profileType: 'website',
    projectCategory: 'internal',
  },
  {
    id: 'demo-wine',
    companyId: 'demo-co',
    brandId: 'demo-wine-brand',
    websiteName: 'Wine Passions（示範）',
    domainUrl: 'https://demo-wine.local',
    platform: 'framer',
    company: 'ZF',
    brand: 'WP',
    level: 2,
    status: 'live',
    pagesCount: 18,
    articlesCount: 8,
    videosCount: 2,
    socialPostsCount: 0,
    keywordsCount: 11,
    pluginsCount: 0,
    totalHours: 0,
    profileType: 'website',
    projectCategory: 'internal',
  },
];

export const DEMO_PAGE: AltPageContext = {
  url: 'https://demo.local/office-design',
  host: 'demo.local',
  title: '香港辦公室設計｜示範頁',
  description: '香港專業辦公室設計及裝修工程，由空間規劃到施工一站式處理。',
  lang: 'zh-HK',
  canonical: 'https://demo.local/office-design',
  ogTitle: '香港辦公室設計｜示範頁',
  ogDescription: '由空間規劃到施工的辦公室設計示範頁。',
  h1: '香港辦公室設計',
  h2s: ['開放式辦公室', '會議室與接待區', '項目數據'],
  h3s: [],
  paragraphs: [
    '我們為香港企業提供由空間規劃、設計到施工的一站式辦公室設計服務。',
    '淺木色地台配合落地玻璃，讓自然光進入工作空間，前場保留洽談區。',
    '會議室以玻璃隔間保持通透，接待區用弧形木櫃與暖色燈帶建立第一印象。',
  ],
  wordCount: 1240,
  summary: [
    '頁面：香港辦公室設計｜示範頁',
    'H1：香港辦公室設計',
    'H2：開放式辦公室 / 會議室與接待區 / 項目數據',
    '描述：香港專業辦公室設計及裝修工程，由空間規劃到施工一站式處理。',
    '正文：\n1. 我們為香港企業提供由空間規劃、設計到施工的一站式辦公室設計服務。\n2. 淺木色地台配合落地玻璃，讓自然光進入工作空間，前場保留洽談區。\n3. 會議室以玻璃隔間保持通透，接待區用弧形木櫃與暖色燈帶建立第一印象。',
  ].join('\n'),
  imageCount: 6,
  skippedImageCount: 2,
  backgroundImageCount: 1,
  truncated: false,
};

export const DEMO_IMAGES: AltImageCandidate[] = [
  {
    url: svgImage({ title: '開放式辦公室', subtitle: '淺木色地台・落地玻璃', from: '#0f766e', to: '#134e4a' }),
    filename: 'office-01',
    location: 'main',
    currentAlt: '',
    hasAltAttr: true,
    width: 1200,
    height: 800,
    ariaHidden: false,
    role: '',
    decorative: false,
    skipReason: null,
    nearbyHeading: '開放式辦公室',
    nearbyCaption: '中環辦公室項目：開放式工作區與洽談區',
    nearbyParagraph: '淺木色地台配合落地玻璃，讓自然光進入工作空間，前場保留洽談區。',
  },
  {
    url: svgImage({ title: '會議室', subtitle: '玻璃隔間・黑色吊燈', from: '#1e3a8a', to: '#0e7490' }),
    filename: 'meeting-02',
    location: 'main',
    currentAlt: '會議室',
    hasAltAttr: true,
    width: 1200,
    height: 800,
    ariaHidden: false,
    role: '',
    decorative: false,
    skipReason: null,
    nearbyHeading: '會議室與接待區',
    nearbyCaption: '',
    nearbyParagraph: '會議室以玻璃隔間保持通透，長桌上方懸掛黑色吊燈。',
  },
  {
    url: svgImage({ title: '接待區', subtitle: '弧形木櫃・暖色燈帶', from: '#7c2d12', to: '#b45309' }),
    filename: 'reception-03',
    location: 'main',
    currentAlt: '',
    hasAltAttr: true,
    width: 1200,
    height: 800,
    ariaHidden: false,
    role: '',
    decorative: false,
    skipReason: null,
    nearbyHeading: '會議室與接待區',
    nearbyCaption: '接待區以弧形木櫃與暖色燈帶迎接訪客。',
    nearbyParagraph: '',
  },
  {
    url: svgImage({ title: 'BW Interior', subtitle: '示範標誌', from: '#0d1a2d', to: '#0D9488', width: 320, height: 120 }),
    filename: 'brand-logo',
    location: 'header',
    currentAlt: 'BW Interior 志豐設計工程標誌',
    hasAltAttr: true,
    width: 320,
    height: 120,
    ariaHidden: false,
    role: '',
    decorative: false,
    skipReason: null,
    nearbyHeading: '',
    nearbyCaption: '',
    nearbyParagraph: '',
  },
  {
    url: svgImage({ title: '項目數據', subtitle: '2026 首季・按項目類型', from: '#312e81', to: '#1d4ed8' }),
    filename: 'chart-04',
    location: 'main',
    currentAlt: '圖表',
    hasAltAttr: true,
    width: 1200,
    height: 800,
    ariaHidden: false,
    role: '',
    decorative: false,
    skipReason: null,
    nearbyHeading: '項目數據',
    nearbyCaption: '',
    nearbyParagraph: '2026 年首季辦公室項目數量按類型分佈。',
  },
  {
    url: svgImage({ title: '', subtitle: '', from: '#e2e8f0', to: '#f8fafc' }),
    filename: 'decor-gradient',
    location: 'footer',
    currentAlt: '',
    hasAltAttr: true,
    width: 600,
    height: 400,
    ariaHidden: true,
    role: 'presentation',
    decorative: true,
    skipReason: null,
    nearbyHeading: '',
    nearbyCaption: '',
    nearbyParagraph: '',
  },
];

export const DEMO_KEYWORDS: AltKeywordOption[] = [
  { id: 'demo-k1', keyword: '辦公室設計', level: 'level_1', search_volume: 2400, target_page: '/office-design' },
  { id: 'demo-k2', keyword: '香港辦公室裝修', level: 'level_2', search_volume: 1200, target_page: null },
  { id: 'demo-k3', keyword: '商業空間設計', level: 'level_3', search_volume: 620, target_page: null },
];

const DEMO_ALTS: Record<string, string[]> = {
  'office-01': [
    '淺木色開放式辦公室，設計師在落地窗前討論平面圖',
    '開放式工作區以淺木地台和落地玻璃引入自然光',
  ],
  'meeting-02': [
    '玻璃隔間會議室，長桌上方懸掛黑色吊燈',
    '可容納八人的會議室，玻璃牆保持視線通透',
  ],
  'reception-03': [
    '接待區以弧形木櫃與暖色燈帶迎接訪客',
    '弧形木質接待櫃檯，背牆以暖色燈帶勾勒',
  ],
  'brand-logo': [
    'BW Interior 志豐設計工程標誌（連往首頁）',
    'BW Interior 品牌標誌，深藍底配青綠色字樣',
  ],
  'chart-04': [
    '2026 年首季辦公室項目數量長條圖，商業空間佔最多',
    '按項目類型分佈的長條圖，商業空間項目領先',
  ],
  'decor-gradient': [''],
};

const DEMO_SHORTS: Record<string, string[]> = {
  'office-01': ['淺木色開放式辦公室', '落地窗旁的開放工作區'],
  'meeting-02': ['玻璃隔間會議室', '八人會議室'],
  'reception-03': ['弧形木櫃接待區', '暖色燈帶接待櫃檯'],
  'brand-logo': ['BW Interior 標誌', 'BW Interior 品牌標誌'],
  'chart-04': ['首季項目數量長條圖', '項目類型分佈圖'],
  'decor-gradient': [''],
};

const DEMO_RATIONALES: Record<string, string> = {
  'office-01': '以材質（淺木）、空間（開放式）與人物動作（討論平面圖）描述畫面，並呼應頁面主題。',
  'meeting-02': '點出玻璃隔間、長桌與吊燈，讓看不到圖的人也能想像會議室配置。',
  'reception-03': '用弧形木櫃與暖色燈帶描述接待區的第一印象，避免只寫「接待區」。',
  'brand-logo': '標誌圖片需說明品牌與連結目的地，而不是只寫「標誌」。',
  'chart-04': '圖表需說明類型、時間範圍與主要趨勢，而不是只寫「圖表」。',
  'decor-gradient': '純裝飾漸變背景沒有資訊價值，建議留空。',
};

export function makeDemoSuggestion(
  image: AltImageCandidate,
  alt: string,
  index: number,
  keyword = '辦公室設計',
): AltSuggestionRow {
  const quality = evaluateAlt({
    alt,
    page: DEMO_PAGE,
    image,
    keyword,
    existingAlts: [],
    decorative: image.decorative,
  });
  const alternatives = (DEMO_ALTS[image.filename] || []).filter((item) => item !== alt).slice(0, 2);
  const now = new Date().toISOString();

  return {
    id: `demo-s-${image.filename}-${index}`,
    run_id: 'demo-run',
    image_url: image.url,
    image_host: 'demo.local',
    image_hash: null,
    filename: image.filename,
    location: image.location,
    current_alt: image.currentAlt,
    context_excerpt: [image.nearbyHeading, image.nearbyCaption, image.nearbyParagraph]
      .filter(Boolean)
      .join(' | '),
    suggested_alt: alt,
    short_alt: truncateText(DEMO_SHORTS[image.filename]?.[0] || alt, 60),
    alternatives,
    rationale: DEMO_RATIONALES[image.filename] || '',
    keyword,
    confidence: 0.84,
    risk: quality.risk,
    issues: quality.issues,
    decorative: image.decorative,
    provider: 'demo',
    status: 'pending',
    final_alt: null,
    reviewed_by: null,
    reviewed_at: null,
    created_at: now,
    updated_at: now,
  };
}

export const DEMO_RUN: AltRunRow = {
  id: 'demo-run',
  site_id: 'demo-bw',
  page_url: DEMO_PAGE.url,
  page_host: DEMO_PAGE.host,
  page_title: DEMO_PAGE.title,
  page_lang: DEMO_PAGE.lang,
  page_hash: 'demo',
  context_summary: DEMO_PAGE.summary,
  keyword: '辦公室設計',
  status: 'ready',
  image_count: DEMO_IMAGES.length,
  generated_count: 3,
  approved_count: 0,
  model: 'demo-preview',
  error: null,
  created_by: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

export const DEMO_SUGGESTIONS: AltSuggestionRow[] = [
  makeDemoSuggestion(DEMO_IMAGES[0], DEMO_ALTS['office-01'][0], 0),
  makeDemoSuggestion(DEMO_IMAGES[1], DEMO_ALTS['meeting-02'][0], 1),
  makeDemoSuggestion(DEMO_IMAGES[2], DEMO_ALTS['reception-03'][0], 2),
];

export const DEMO_SETTINGS: AltSettingsRow = {
  id: 'default',
  enabled: true,
  model: 'demo-preview',
  fallback_model: 'demo-preview',
  daily_call_limit: 300,
  max_images_per_run: 40,
  max_images_per_call: 6,
  created_at: new Date(0).toISOString(),
  updated_at: new Date(0).toISOString(),
};

export const DEMO_USAGE: AltUsageSummary = { today: 3, limit: 300 };

export const DEMO_HISTORY: AltRunRow[] = [
  DEMO_RUN,
  {
    ...DEMO_RUN,
    id: 'demo-run-older',
    page_url: 'https://demo.local/meeting-room',
    page_host: 'demo.local',
    page_title: '會議室設計｜示範頁',
    status: 'exported',
    image_count: 9,
    generated_count: 9,
    approved_count: 7,
    created_at: new Date(Date.now() - 86_400_000).toISOString(),
  },
  {
    ...DEMO_RUN,
    id: 'demo-run-oldest',
    page_url: 'https://demo.local/reception',
    page_host: 'demo.local',
    page_title: '接待區設計｜示範頁',
    status: 'analyzed',
    image_count: 4,
    generated_count: 0,
    approved_count: 0,
    created_at: new Date(Date.now() - 2 * 86_400_000).toISOString(),
  },
];

export function demoAltPool(image: AltImageCandidate): string[] {
  return DEMO_ALTS[image.filename] || [''];
}
