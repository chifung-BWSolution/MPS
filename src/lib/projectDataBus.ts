type Listener = () => void;

const buses = new Map<string, Set<Listener>>();

export function projectIncomesKey(projectId: string): string {
  return `incomes:${projectId}`;
}

export function projectSchedulesKey(relatedType: string, relatedId: string): string {
  return `schedules:${relatedType}:${relatedId}`;
}

export function projectDocsKey(projectId: string): string {
  return `docs:${projectId}`;
}

export function subscribeProjectData(key: string, listener: Listener): () => void {
  let set = buses.get(key);
  if (!set) {
    set = new Set();
    buses.set(key, set);
  }
  set.add(listener);
  return () => {
    set.delete(listener);
    if (set.size === 0) buses.delete(key);
  };
}

export function publishProjectData(key: string): void {
  buses.get(key)?.forEach((listener) => listener());
}
