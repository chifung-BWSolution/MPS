import React, { createContext, useContext, useState, useCallback, useMemo, ReactNode } from 'react';
import { WebsiteProfileFull } from '@/types/app';
import { websiteProfiles as initialWebsites } from '@/data/websiteData';
import { filterOutSampleData, getSampleDataSummary } from '@/data/sampleDataRegistry';

// ===== Integrity check result =====
export interface IntegrityCheck {
  canDelete: boolean;
  reasons: string[];
}

// ===== Data Store Context =====
interface DataStoreContextType {
  // Websites (legacy dual-write from WebsiteModule + sample data tooling)
  websites: WebsiteProfileFull[];
  addWebsite: (website: Omit<WebsiteProfileFull, 'id'>) => WebsiteProfileFull;
  addWebsiteWithId: (website: WebsiteProfileFull) => void;
  updateWebsite: (id: string, data: Partial<WebsiteProfileFull>) => void;
  deleteWebsite: (id: string) => IntegrityCheck;
  getWebsiteById: (id: string) => WebsiteProfileFull | undefined;

  // Sample Data Management
  sampleDataEnabled: boolean;
  setSampleDataEnabled: (enabled: boolean) => void;
  clearAllSampleData: () => void;
  restoreSampleData: () => void;
  sampleDataSummary: { totalSample: number; totalReal: number; breakdown: Record<string, { sample: number; real: number }> };
}

// Use globalThis to persist context across HMR reloads
const DATA_STORE_CONTEXT_KEY = '__DataStoreContext__';
if (!(globalThis as any)[DATA_STORE_CONTEXT_KEY]) {
  (globalThis as any)[DATA_STORE_CONTEXT_KEY] = createContext<DataStoreContextType | null>(null);
}
const DataStoreContext = (globalThis as any)[DATA_STORE_CONTEXT_KEY] as React.Context<DataStoreContextType | null>;

// Generate unique ID
let idCounter = 1000;
function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${idCounter++}`;
}

export function DataStoreProvider({ children }: { children: ReactNode }) {
  // Sample data toggle — persisted to localStorage
  const [sampleDataEnabled, setSampleDataEnabledState] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem('bw_sample_data_enabled');
      return stored !== null ? JSON.parse(stored) : true; // Default: show sample data
    } catch {
      return true;
    }
  });

  const setSampleDataEnabled = useCallback((enabled: boolean) => {
    setSampleDataEnabledState(enabled);
    try { localStorage.setItem('bw_sample_data_enabled', JSON.stringify(enabled)); } catch {}
  }, []);

  const [websites, setWebsites] = useState<WebsiteProfileFull[]>(initialWebsites);

  const filterIfNeeded = useCallback(<T,>(data: T[]): T[] => {
    return sampleDataEnabled ? data : filterOutSampleData(data);
  }, [sampleDataEnabled]);

  const filteredWebsites = useMemo(() => filterIfNeeded(websites), [websites, filterIfNeeded]);

  const clearAllSampleData = useCallback(() => {
    setWebsites(prev => filterOutSampleData(prev));
    setSampleDataEnabled(false);
  }, [setSampleDataEnabled]);

  const restoreSampleData = useCallback(() => {
    setWebsites(initialWebsites);
    setSampleDataEnabled(true);
  }, [setSampleDataEnabled]);

  const sampleDataSummary = useMemo(() => {
    return getSampleDataSummary({ websites });
  }, [websites]);

  // ===== WEBSITE CRUD =====
  const addWebsite = useCallback((data: Omit<WebsiteProfileFull, 'id'>): WebsiteProfileFull => {
    const newWebsite: WebsiteProfileFull = { ...data, id: generateId('ws') };
    setWebsites(prev => [...prev, newWebsite]);
    return newWebsite;
  }, []);

  const addWebsiteWithId = useCallback((website: WebsiteProfileFull): void => {
    setWebsites(prev => {
      if (prev.some(w => w.id === website.id)) return prev;
      return [...prev, website];
    });
  }, []);

  const updateWebsite = useCallback((id: string, data: Partial<WebsiteProfileFull>) => {
    setWebsites(prev => prev.map(w => w.id === id ? { ...w, ...data } : w));
  }, []);

  const deleteWebsite = useCallback((id: string): IntegrityCheck => {
    setWebsites(prev => prev.filter(w => w.id !== id));
    return { canDelete: true, reasons: [] };
  }, []);

  const getWebsiteById = useCallback((id: string) => filteredWebsites.find(w => w.id === id), [filteredWebsites]);

  const value: DataStoreContextType = {
    websites: filteredWebsites, addWebsite, addWebsiteWithId, updateWebsite, deleteWebsite, getWebsiteById,
    sampleDataEnabled, setSampleDataEnabled, clearAllSampleData, restoreSampleData, sampleDataSummary,
  };

  return (
    <DataStoreContext.Provider value={value}>
      {children}
    </DataStoreContext.Provider>
  );
}

export function useDataStore() {
  const context = useContext(DataStoreContext);
  if (!context) {
    throw new Error('useDataStore must be used within a DataStoreProvider');
  }
  return context;
}
