import type {
  AltImageCandidate,
  AltPageContext,
  AltRow,
  AltRunRow,
  AltSuggestionRow,
} from '@/lib/altTypes.ts';

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  try {
    return new Intl.DateTimeFormat('zh-HK', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  } catch {
    return value;
  }
}

export function formatPercent(value: number): string {
  return `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`;
}

export function pageFromRunRow(run: AltRunRow): AltPageContext {
  return {
    url: run.page_url,
    host: run.page_host,
    title: run.page_title,
    description: '',
    lang: run.page_lang,
    canonical: '',
    ogTitle: '',
    ogDescription: '',
    h1: '',
    h2s: [],
    h3s: [],
    paragraphs: [],
    wordCount: 0,
    summary: run.context_summary,
    imageCount: run.image_count,
    skippedImageCount: 0,
    backgroundImageCount: 0,
    truncated: false,
  };
}

export function imageFromSuggestion(suggestion: AltSuggestionRow): AltImageCandidate {
  return {
    url: suggestion.image_url,
    filename: suggestion.filename,
    location: suggestion.location,
    currentAlt: suggestion.current_alt,
    hasAltAttr: suggestion.current_alt.length > 0,
    width: null,
    height: null,
    ariaHidden: false,
    role: '',
    decorative: suggestion.decorative,
    skipReason: null,
    nearbyHeading: '',
    nearbyCaption: '',
    nearbyParagraph: suggestion.context_excerpt,
  };
}

export function rowsFromSuggestions(suggestions: AltSuggestionRow[]): AltRow[] {
  return suggestions.map((suggestion) => ({
    image: imageFromSuggestion(suggestion),
    suggestion,
  }));
}

export function isSelectableRow(row: AltRow): boolean {
  return (
    !row.image.skipReason &&
    row.suggestion?.status !== 'approved' &&
    row.suggestion?.status !== 'rejected'
  );
}

export function isPendingRow(row: AltRow): boolean {
  return Boolean(
    row.suggestion &&
      (row.suggestion.status === 'pending' || row.suggestion.status === 'failed'),
  );
}

export function displayAlt(suggestion: AltSuggestionRow | null): string {
  if (!suggestion) return '';
  return (suggestion.final_alt || suggestion.suggested_alt || '').trim();
}
