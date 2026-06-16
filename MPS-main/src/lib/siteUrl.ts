// Canonical public URL of the app. Anything user-facing (OAuth redirects,
// invite links, copyable URLs) should be built off this so the host stays
// stable across the legacy Vercel preview domain and the production domain.
export const CANONICAL_SITE_URL = 'https://bwteam-marketing.com';

const LEGACY_HOSTS = new Set(['mps-lilac.vercel.app']);

// In-browser: prefer the runtime origin if it's already canonical, otherwise
// (e.g. user landed on the legacy vercel.app preview) return the canonical
// origin so that any URL we produce points at the right host.
export const getSiteOrigin = (): string => {
  if (typeof window === 'undefined') return CANONICAL_SITE_URL;
  try {
    const host = window.location.hostname;
    if (LEGACY_HOSTS.has(host)) return CANONICAL_SITE_URL;
    return window.location.origin;
  } catch {
    return CANONICAL_SITE_URL;
  }
};

// One-shot boot redirect. Call from main.tsx before React mounts so the
// browser tab ends up on the canonical host without flashing the legacy URL.
export const redirectFromLegacyHost = () => {
  if (typeof window === 'undefined') return;
  try {
    const host = window.location.hostname;
    if (!LEGACY_HOSTS.has(host)) return;
    const target = new URL(
      window.location.pathname + window.location.search + window.location.hash,
      CANONICAL_SITE_URL,
    ).toString();
    window.location.replace(target);
  } catch {
    // If anything throws (e.g. URL parsing in an old WebView) just no-op —
    // the app still renders on the legacy host, which is the previous behavior.
  }
};
