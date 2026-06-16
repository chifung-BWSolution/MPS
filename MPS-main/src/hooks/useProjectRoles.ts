import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'mps_project_roles_v1';
const DEFAULT_ROLES = [
  '負責人 / PM',
  '設計師',
  '前端開發',
  '後端開發',
  '文案 / SEO',
  '剪輯',
  'PM 助理',
  '市場推廣',
];

const subscribers = new Set<(roles: string[]) => void>();
let cachedRoles: string[] | null = null;

function read(): string[] {
  if (cachedRoles) return cachedRoles;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.every(v => typeof v === 'string')) {
        cachedRoles = parsed;
        return parsed;
      }
    }
  } catch {}
  cachedRoles = [...DEFAULT_ROLES];
  return cachedRoles;
}

function write(next: string[]) {
  cachedRoles = next;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
  subscribers.forEach(fn => fn(next));
}

export function useProjectRoles() {
  const [roles, setRoles] = useState<string[]>(() => read());

  useEffect(() => {
    const listener = (next: string[]) => setRoles(next);
    subscribers.add(listener);
    return () => { subscribers.delete(listener); };
  }, []);

  const addRole = useCallback((name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const current = read();
    if (current.includes(trimmed)) return;
    write([...current, trimmed]);
  }, []);

  const removeRole = useCallback((name: string) => {
    const current = read();
    write(current.filter(r => r !== name));
  }, []);

  return { roles, addRole, removeRole };
}
