/** Click modifiers that should open a same-origin app hash in a new tab. */
export type ModifierClickEvent = {
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  button?: number;
  preventDefault?: () => void;
  target?: EventTarget | null;
  currentTarget?: EventTarget | null;
};

let activeGesture: MouseEvent | null = null;

function rememberGesture(event: Event) {
  if (!(event instanceof MouseEvent)) return;
  activeGesture = event;
  // React 17+ can run the delegated onClick after this native dispatch.
  // Do not clear in a microtask — that drops Ctrl+click before the row handler.
  globalThis.setTimeout?.(() => {
    if (activeGesture === event) activeGesture = null;
  }, 0);
}

/** Remember Ctrl/Cmd clicks so hash navigations can open a new tab instead. */
export function installAppNavGestureListener(): () => void {
  if (typeof document === 'undefined') return () => {};
  document.addEventListener('click', rememberGesture, true);
  document.addEventListener('auxclick', rememberGesture, true);
  return () => {
    document.removeEventListener('click', rememberGesture, true);
    document.removeEventListener('auxclick', rememberGesture, true);
    activeGesture = null;
  };
}

export function isModifiedClick(event?: ModifierClickEvent | null): boolean {
  if (!event) return false;
  return Boolean(
    event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey ||
      (typeof event.button === 'number' && event.button !== 0),
  );
}

export function consumeOpenInNewTab(): boolean {
  const event = activeGesture;
  activeGesture = null;
  if (!event) return false;
  return Boolean(event.ctrlKey || event.metaKey);
}

export function buildSameOriginHref(hash: string): string {
  const clean = hash.replace(/^#/, '');
  try {
    const loc = globalThis.window?.location;
    if (!loc) return `#${clean}`;
    return `${loc.pathname}${loc.search}#${clean}`;
  } catch {
    return `#${clean}`;
  }
}

export function openInNewTab(href: string): void {
  try {
    const doc = globalThis.document;
    if (doc) {
      const anchor = doc.createElement('a');
      anchor.href = href;
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      doc.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      return;
    }
    globalThis.window?.open(href, '_blank', 'noopener,noreferrer');
  } catch {
    /* ignore */
  }
}

function isNestedInteractive(event: ModifierClickEvent): boolean {
  const target = event.target;
  if (!target || !(target instanceof Element)) return false;
  const interactive = target.closest('a[href], button, input, select, textarea, label, [role="menuitem"]');
  if (!interactive) return false;
  const current = event.currentTarget;
  if (current instanceof Element && interactive === current) return false;
  return true;
}

export function shouldOpenHrefInNewTab(event?: ModifierClickEvent | null): boolean {
  if (!event) return false;
  return Boolean(event.ctrlKey || event.metaKey || event.button === 1);
}

/** Use the real click event (not the capture gesture) so table rows open a new tab. */
export function handleAppHrefClick(
  event: ModifierClickEvent,
  href: string,
  onSameTab: () => void,
  options?: { beforeNewTab?: () => void },
): boolean {
  if (isNestedInteractive(event)) return false;
  if (shouldOpenHrefInNewTab(event)) {
    event.preventDefault?.();
    options?.beforeNewTab?.();
    openInNewTab(href);
    return true;
  }
  onSameTab();
  return false;
}

export function appHrefClickProps(
  href: string,
  onSameTab: () => void,
  options?: { beforeNewTab?: () => void },
): {
  onClick: (event: ModifierClickEvent) => void;
  onAuxClick: (event: ModifierClickEvent) => void;
} {
  const onClick = (event: ModifierClickEvent) => {
    handleAppHrefClick(event, href, onSameTab, options);
  };
  return { onClick, onAuxClick: onClick };
}

export function openHashInNewTabIfRequested(hash: string): boolean {
  if (!consumeOpenInNewTab()) return false;
  openInNewTab(buildSameOriginHref(hash));
  return true;
}

function normalizeHash(hash: string): string {
  return hash.replace(/^#/, '').replace(/^\/+/, '');
}

/**
 * Set `location.hash`, or open that hash in a new tab when the click was Ctrl/Cmd.
 * @returns true when this tab was left unchanged because a new tab opened
 */
export function applyLocationHash(nextHash: string, event?: ModifierClickEvent | null): boolean {
  const clean = normalizeHash(nextHash);
  const openNew = event ? shouldOpenHrefInNewTab(event) : consumeOpenInNewTab();
  if (openNew) {
    openInNewTab(buildSameOriginHref(clean));
    return true;
  }
  try {
    const loc = globalThis.window?.location;
    if (!loc) return false;
    if (normalizeHash(loc.hash) === clean) return false;
    loc.hash = `#${clean}`;
  } catch {
    /* ignore */
  }
  return false;
}
