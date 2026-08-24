import {
  Children,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react';

export const MODAL_FOOTER_ATTR = 'data-modal-footer';

function getTypeName(node: ReactElement): string {
  const type = node.type as { displayName?: string; name?: string } | string;
  if (typeof type === 'string') return type;
  return type.displayName || type.name || '';
}

function classNameOf(node: ReactElement): string {
  return typeof node.props?.className === 'string' ? node.props.className : '';
}

function isOverlaySibling(node: ReactNode): boolean {
  if (!isValidElement(node)) return false;
  const name = getTypeName(node);
  return name === 'DeleteConfirmModal' || name === 'AlertDialog';
}

export function looksLikeActionFooter(node: ReactNode): boolean {
  if (!isValidElement(node)) return false;
  if (node.props?.[MODAL_FOOTER_ATTR] !== undefined) return true;

  const name = getTypeName(node);
  if (name === 'DialogFooter' || name === 'AlertDialogFooter' || name === 'CrudModalFooter') {
    return true;
  }
  if (isOverlaySibling(node)) return false;

  if (node.type === 'button' || name === 'Button') {
    const cls = classNameOf(node);
    return cls.includes('w-full') || /\bmt-\d/.test(cls);
  }

  const cls = classNameOf(node);
  return cls.includes('flex') && (cls.includes('justify-end') || cls.includes('justify-between'));
}

function extractFromWrapper(wrapper: ReactElement): { body: ReactElement; footer: ReactNode } | null {
  const inner = Children.toArray(wrapper.props.children);
  if (inner.length < 2) return null;
  const last = inner[inner.length - 1];
  if (!looksLikeActionFooter(last)) return null;
  return {
    body: cloneElement(wrapper, undefined, inner.slice(0, -1)),
    footer: last,
  };
}

export function splitModalChrome(children: ReactNode): {
  body: ReactNode;
  footer: ReactNode | null;
  extras: ReactNode[];
} {
  const arr = Children.toArray(children);
  const extras: ReactNode[] = [];
  let end = arr.length;
  while (end > 0 && isOverlaySibling(arr[end - 1])) {
    extras.unshift(arr[end - 1]);
    end -= 1;
  }

  const main = arr.slice(0, end);
  if (main.length === 0) {
    return { body: null, footer: null, extras };
  }

  const last = main[main.length - 1];
  if (looksLikeActionFooter(last)) {
    return {
      body: main.length === 1 ? null : main.slice(0, -1),
      footer: last,
      extras,
    };
  }

  if (main.length === 1 && isValidElement(last) && last.type === 'div') {
    const extracted = extractFromWrapper(last);
    if (extracted) {
      return { body: extracted.body, footer: extracted.footer, extras };
    }
  }

  return {
    body: main.length === 1 ? main[0] : main,
    footer: null,
    extras,
  };
}

export function splitDialogChrome(children: ReactNode): {
  headers: ReactNode[];
  body: ReactNode;
  footers: ReactNode[];
  structured: boolean;
} {
  const arr = Children.toArray(children);
  const headers: ReactNode[] = [];
  const rest: ReactNode[] = [];
  const namedFooters: ReactNode[] = [];

  for (const child of arr) {
    if (!isValidElement(child)) {
      rest.push(child);
      continue;
    }
    const name = getTypeName(child);
    if (name === 'DialogHeader' || name === 'AlertDialogHeader') {
      headers.push(child);
    } else if (name === 'DialogFooter' || name === 'AlertDialogFooter') {
      namedFooters.push(child);
    } else {
      rest.push(child);
    }
  }

  const split = splitModalChrome(rest.length === 1 ? rest[0] : rest);
  const footers = split.footer ? [...namedFooters, split.footer] : namedFooters;

  return {
    headers,
    body: split.body,
    footers,
    structured: headers.length > 0 || footers.length > 0,
  };
}

export function CrudModalFooter({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div data-modal-footer="" className={className}>
      {children}
    </div>
  );
}
CrudModalFooter.displayName = 'CrudModalFooter';
