/**
 * 社媒自動化營運 · 模板內容生成（v0 autopilot）
 *
 * 目的：在沒有 LLM key 的情況下也能**立即產出可審核的文案**，
 * 讓「熱點 → 1 篇長文 + 每平台每帳號一條導流」整條流程今天就能跑起來。
 * 日後接上 Gemini 時，只需把 composeLongform / composeSocial 換成 LLM 版本，
 * 其餘（批次、狀態、UI）不用改。
 *
 * 純函式，Deno 與瀏覽器皆可載入。
 */

export type SocialPlatformKey =
  | 'instagram'
  | 'threads'
  | 'facebook'
  | 'xiaohongshu'
  | 'youtube'
  | 'other';

export const SOCIAL_PLATFORM_LABEL: Record<string, string> = {
  instagram: 'Instagram',
  threads: 'Threads',
  facebook: 'Facebook',
  xiaohongshu: '小紅書',
  youtube: 'YouTube',
  other: '其他',
};

export const SOCIAL_PLATFORM_ORDER: SocialPlatformKey[] = [
  'instagram',
  'threads',
  'facebook',
  'xiaohongshu',
  'youtube',
  'other',
];

export function socialPlatformLabel(platform: string | null | undefined): string {
  return SOCIAL_PLATFORM_LABEL[(platform || '').trim()] || platform || '其他';
}

export function platformOrder(platform: string): number {
  const index = SOCIAL_PLATFORM_ORDER.indexOf(platform as SocialPlatformKey);
  return index >= 0 ? index : SOCIAL_PLATFORM_ORDER.length;
}

function trimTo(value: string, max: number): string {
  const text = (value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(1, max - 1)).replace(/[，,、；;\s]+$/, '')}…`;
}

export interface ComposeLongformInput {
  eventTitle: string;
  eventSummary?: string | null;
  groupName?: string | null;
  brandName?: string | null;
  /** 文章欄目（顯示在副標） */
  sectionName?: string | null;
}

export interface ComposedLongform {
  title: string;
  excerpt: string;
  body_md: string;
  hashtags: string[];
}

const HOOKS = [
  '最近好多人都喺度問同一個問題',
  '呢排最多人討論嘅，就係呢件事',
  '同一個問題，我哋今個星期收到三次',
  '身邊唔少朋友都遇到同樣情況',
];

function pick<T>(list: T[], seed: string): T {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) % 100_000;
  }
  return list[hash % list.length];
}

function hashtagsOf(title: string, extra: string[] = []): string[] {
  const stop = new Set(['嘅', '咗', '係', '同', '與', '及', '的', '了', '在', '和', '就', '都', '唔', '好', '呢', '個', '我', '你', '他', '她', '這', '那', '有', '無', '要', '會', '可以', '一次', '點', '樣', '做', '嗎', '？', '?']);
  const tokens = (title || '')
    .replace(/[A-Za-z0-9]+/g, (match) => ` ${match} `)
    .split(/[\s，,。.!！?？、：:；;「」『』（）()\-—|/]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && token.length <= 10 && !stop.has(token));
  const merged = [...new Set([...extra, ...tokens])];
  return merged.slice(0, 6).map((tag) => tag.replace(/^#/, ''));
}

/**
 * 產生站內長文（Markdown）。結構固定，讓審核者一眼看完：
 * 為什麼值得談 → 重點整理 → 實際做法 → 常見誤區 → 編輯室點睇。
 */
export function composeLongform(input: ComposeLongformInput): ComposedLongform {
  const title = trimTo(input.eventTitle, 42) || '今日熱點';
  const summary = trimTo(input.eventSummary || '', 120);
  const group = (input.groupName || input.brandName || '').trim();
  const hook = pick(HOOKS, title);

  const excerpt = summary
    ? `${summary}${summary.endsWith('。') ? '' : '。'}以下整理五個重點同實際做法，幫你一次睇清楚。`
    : `${hook}：${title}。以下用五個部分整理重點、實際做法同常見誤區，睇完就可以決定下一步。`;

  const sections: { heading: string; body: string }[] = [
    {
      heading: '點解呢件事值得留意',
      body: `${hook}：**${title}**。\n\n${summary || '大家关心的不只是「有沒有效」，而是「適不適合自己、要花多少時間與預算」。這篇文章把討論整理成可以行動的版本。'}`,
    },
    {
      heading: '重點整理',
      body: [
        `- **核心問題**：${trimTo(summary || title, 60)}`,
        '- **誰需要留意**：正在考慮同類選擇、或已經試過但效果不似預期的人。',
        '- **最常見誤解**：把「別人有效」直接當成「自己一定有效」，忽略了條件差異。',
        '- **判斷標準**：先看自己的條件與限制，再看方案，而不是倒過來。',
      ].join('\n'),
    },
    {
      heading: '實際可以點做',
      body: [
        '1. **先釐清目標**：想要的是即時效果、長期穩定，還是兩者兼顧？目標不同，選擇就不同。',
        '2. **檢查自身條件**：時間、預算、可承受的風險，先寫下來再比較方案。',
        '3. **由小範圍開始**：先用最小可行的方法試一輪，記錄結果，再決定是否加碼。',
        '4. **預留調整空間**：任何方案都需要一次修正，不要把時間表排到剛剛好。',
      ].join('\n'),
    },
    {
      heading: '常見誤區',
      body: [
        '- 只看見成功案例，沒有看見對方背後的條件與投入。',
        '- 一次過把所有方法疊加，結果分不清哪一個有效。',
        '- 用「有沒有效」取代「適不適合」，最後花了錢卻沒有解決問題。',
      ].join('\n'),
    },
    {
      heading: '編輯室點睇',
      body: `我哋的建議是：先處理最影響結果的那一個變數，其餘的先放一邊。${group ? `\n\n本文由 ${group} 編輯整理。` : ''}`,
    },
  ];

  const body_md = sections
    .map((section) => `## ${section.heading}\n\n${section.body}`)
    .join('\n\n');

  return {
    title,
    excerpt: trimTo(excerpt, 150),
    body_md,
    hashtags: hashtagsOf(title, summary ? [trimTo(summary, 12)] : []),
  };
}

export interface ComposeSocialInput {
  platform: SocialPlatformKey | string;
  title: string;
  excerpt?: string | null;
  hashtags?: string[];
  /** 站內文章連結（有就放入 CTA） */
  link?: string | null;
  groupName?: string | null;
}

export interface ComposedSocial {
  caption: string;
  hashtags: string[];
}

function tagLine(tags: string[]): string {
  return tags.map((tag) => `#${tag.replace(/\s+/g, '')}`).join(' ');
}

/** 依平台產生導流文案；同一平台多個帳號共用同一份（PRD §10）。 */
export function composeSocial(input: ComposeSocialInput): ComposedSocial {
  const platform = (input.platform || 'other') as SocialPlatformKey;
  const title = trimTo(input.title, 40);
  const excerpt = trimTo(input.excerpt || '', 90);
  const tags = (input.hashtags && input.hashtags.length > 0
    ? input.hashtags
    : hashtagsOf(input.title)
  ).slice(0, 8);
  const linkLine = input.link ? `\n\n完整文章：${input.link}` : '';

  switch (platform) {
    case 'instagram': {
      const caption = [
        `✨ ${title}`,
        '',
        excerpt,
        '',
        '我哋整理咗 5 個重點：',
        '1️⃣ 先釐清目標',
        '2️⃣ 檢查自身條件',
        '3️⃣ 由小範圍開始試',
        '',
        input.link ? `👉 完整文章喺 bio 連結` : '👉 想知多啲，留言問我哋',
        '',
        tagLine(tags.slice(0, 5)),
      ].join('\n');
      return { caption, hashtags: tags.slice(0, 5) };
    }
    case 'threads': {
      const caption = [
        `${title}`,
        '',
        `${excerpt || '呢個問題唔少人都問過。'}`,
        '',
        '你哋又點睇？留言講下你嘅經驗。',
        '',
        tagLine(tags.slice(0, 2)),
      ].join('\n');
      return { caption, hashtags: tags.slice(0, 2) };
    }
    case 'facebook': {
      const caption = [
        `【${title}】`,
        '',
        excerpt || '最近同唔少客人傾開呢個話題，整理咗幾個重點同大家分享。',
        '',
        '文章入面會講清楚：為什麼值得留意、實際可以點做、同最常見嘅誤區。',
        linkLine,
        '',
        tagLine(tags.slice(0, 3)),
      ].join('\n');
      return { caption, hashtags: tags.slice(0, 3) };
    }
    case 'xiaohongshu': {
      const caption = [
        `🔥 ${title}`,
        '',
        '姊妹們，呢個問題真係好多人問！',
        excerpt ? `\n${excerpt}\n` : '',
        '✅ 重點一次睇：',
        '· 先搞清楚自己想要咩',
        '· 唔好一次過疊加太多方法',
        '· 預留時間調整',
        '',
        input.link ? '📎 完整文章連結放喺下面' : '📎 想睇完整版就留言「想要」',
        '',
        tagLine(tags.slice(0, 6)),
      ].join('\n');
      return { caption, hashtags: tags.slice(0, 6) };
    }
    default: {
      const caption = [`${title}`, '', excerpt, linkLine, '', tagLine(tags.slice(0, 3))]
        .filter((line) => line !== '')
        .join('\n');
      return { caption, hashtags: tags.slice(0, 3) };
    }
  }
}

/** 下一個排定時間：下一個香港時間 10:00（若已過就順延一日） */
export function nextPublishAtHkt(now: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Hong_Kong',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const read = (type: string) => parts.find((part) => part.type === type)?.value ?? '00';
  const dateStr = `${read('year')}-${read('month')}-${read('day')}`;
  const hour = Number(read('hour'));
  const minute = Number(read('minute'));
  const alreadyPast = hour > 10 || (hour === 10 && minute >= 0);

  const [year, month, day] = dateStr.split('-').map(Number);
  const target = new Date(Date.UTC(year, month - 1, day + (alreadyPast ? 1 : 0), 10 - 8, 0, 0));
  return target.toISOString();
}
