import React, { createContext, useContext, useState, useCallback, useMemo, ReactNode } from 'react';
import { WebsiteProfileFull, EdmCampaign } from '@/types/app';
import { websiteProfiles as initialWebsites } from '@/data/websiteData';
import { websiteEdmCampaigns as initialWebsiteEdmCampaigns } from '@/data/websiteDetailData';
import { filterOutSampleData, getSampleDataSummary } from '@/data/sampleDataRegistry';

// ===== Supplier type =====
export interface SupplierData {
  id: string;
  name: string;
  category: string;
  contactPerson: string;
  email: string;
  phone: string;
  website: string;
  contractStatus: 'active' | 'expired' | 'pending';
  serviceType: string;
  feeRange: string;
  averageRating: number;
  isRecommended: boolean;
  totalSpend: number;
  companyId?: string;
  notes: string;
  lastEngagement?: string;
}

// ===== Integrity check result =====
export interface IntegrityCheck {
  canDelete: boolean;
  reasons: string[];
}

// ===== Data Store Context =====
interface DataStoreContextType {
  // Websites
  websites: WebsiteProfileFull[];
  addWebsite: (website: Omit<WebsiteProfileFull, 'id'>) => WebsiteProfileFull;
  addWebsiteWithId: (website: WebsiteProfileFull) => void;
  updateWebsite: (id: string, data: Partial<WebsiteProfileFull>) => void;
  deleteWebsite: (id: string) => IntegrityCheck;
  getWebsiteById: (id: string) => WebsiteProfileFull | undefined;

  // EDM Campaigns
  edmCampaigns: Record<string, EdmCampaign[]>;
  allEdmCampaignsList: (EdmCampaign & { websiteName: string; company: string; brand: string })[];
  addEdmCampaign: (websiteId: string, campaign: Omit<EdmCampaign, 'id'>) => EdmCampaign;
  updateEdmCampaign: (websiteId: string, campaignId: string, data: Partial<EdmCampaign>) => void;
  deleteEdmCampaign: (websiteId: string, campaignId: string) => IntegrityCheck;

  // Suppliers
  suppliers: SupplierData[];
  addSupplier: (supplier: Omit<SupplierData, 'id'>) => SupplierData;
  updateSupplier: (id: string, data: Partial<SupplierData>) => void;
  deleteSupplier: (id: string) => IntegrityCheck;

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

// Initial suppliers (模擬數據)
const initialSuppliers: (SupplierData & { __sampleData: true })[] = [
  { __sampleData: true, id: 'sup1', name: 'PrintMaster Co.', category: 'printing', contactPerson: 'John Wu', email: 'john@printmaster.com', phone: '+852 2345 0001', website: 'www.printmaster.com', contractStatus: 'active', serviceType: '印刷服務', feeRange: '$2,000 - $10,000', averageRating: 4.5, isRecommended: true, totalSpend: 45000, notes: '長期合作夥伴', lastEngagement: '2024-12-10' },
  { __sampleData: true, id: 'sup2', name: 'SoundWave Audio', category: 'videography', contactPerson: 'David Lee', email: 'info@soundwave.com', phone: '+852 2345 0002', website: 'www.soundwave.com', contractStatus: 'active', serviceType: '音頻製作', feeRange: '$3,000 - $15,000', averageRating: 4.2, isRecommended: true, totalSpend: 32000, notes: '', lastEngagement: '2024-12-08' },
  { __sampleData: true, id: 'sup3', name: 'FlexVenue Events', category: 'other', contactPerson: 'Amy Chan', email: 'book@flexvenue.com', phone: '+852 2345 0003', website: 'www.flexvenue.com', contractStatus: 'expired', serviceType: '場地租賃', feeRange: '$5,000 - $50,000', averageRating: 3.8, isRecommended: false, totalSpend: 28000, notes: '合約已到期', lastEngagement: '2024-11-20' },
  { __sampleData: true, id: 'sup4', name: 'PixelPerfect Design', category: 'development', contactPerson: 'Kevin Ho', email: 'hello@pixelperfect.co', phone: '+852 2345 0004', website: 'www.pixelperfect.co', contractStatus: 'active', serviceType: '外包設計', feeRange: '$5,000 - $30,000', averageRating: 4.8, isRecommended: true, totalSpend: 68000, notes: '優質設計師', lastEngagement: '2024-12-14' },
  { __sampleData: true, id: 'sup5', name: 'CloudHost Solutions', category: 'hosting', contactPerson: 'Tommy Ng', email: 'support@cloudhost.io', phone: '+852 2345 0005', website: 'www.cloudhost.io', contractStatus: 'pending', serviceType: '雲端主機', feeRange: '$500 - $3,000/月', averageRating: 4.0, isRecommended: false, totalSpend: 18000, notes: '', lastEngagement: '2024-12-01' },
  { __sampleData: true, id: 'sup6', name: 'SEO Expert HK', category: 'seo', contactPerson: 'Lily Wong', email: 'info@seoexpert.hk', phone: '+852 2345 0006', website: 'www.seoexpert.hk', contractStatus: 'active', serviceType: 'SEO 顧問', feeRange: '$8,000 - $25,000/月', averageRating: 4.3, isRecommended: true, totalSpend: 96000, notes: 'SEO 主要供應商', lastEngagement: '2024-11-28' },
];

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

  // State — only domains still consumed via DataStore
  const [websites, setWebsites] = useState<WebsiteProfileFull[]>(initialWebsites);
  const [edmCampaigns, setEdmCampaigns] = useState<Record<string, EdmCampaign[]>>(initialWebsiteEdmCampaigns);
  const [suppliers, setSuppliers] = useState<SupplierData[]>(initialSuppliers);

  // Filter helper: applies sample data filter when disabled
  const filterIfNeeded = useCallback(<T,>(data: T[]): T[] => {
    return sampleDataEnabled ? data : filterOutSampleData(data);
  }, [sampleDataEnabled]);

  const filterRecordIfNeeded = useCallback(<T,>(data: Record<string, T[]>): Record<string, T[]> => {
    if (sampleDataEnabled) return data;
    const result: Record<string, T[]> = {};
    for (const [key, items] of Object.entries(data)) {
      const filtered = filterOutSampleData(items);
      if (filtered.length > 0) result[key] = filtered;
    }
    return result;
  }, [sampleDataEnabled]);

  // Exposed filtered data
  const filteredWebsites = useMemo(() => filterIfNeeded(websites), [websites, filterIfNeeded]);
  const filteredEdmCampaigns = useMemo(() => filterRecordIfNeeded(edmCampaigns), [edmCampaigns, filterRecordIfNeeded]);
  const filteredSuppliers = useMemo(() => filterIfNeeded(suppliers), [suppliers, filterIfNeeded]);

  // Clear all sample data permanently
  const clearAllSampleData = useCallback(() => {
    setWebsites(prev => filterOutSampleData(prev));
    setSuppliers(prev => filterOutSampleData(prev));
    setEdmCampaigns(prev => {
      const result: Record<string, EdmCampaign[]> = {};
      for (const [k, v] of Object.entries(prev)) {
        const filtered = filterOutSampleData(v);
        if (filtered.length > 0) result[k] = filtered;
      }
      return result;
    });
    setSampleDataEnabled(false);
  }, [setSampleDataEnabled]);

  // Restore sample data (reload initial data)
  const restoreSampleData = useCallback(() => {
    setWebsites(initialWebsites);
    setEdmCampaigns(initialWebsiteEdmCampaigns);
    setSuppliers(initialSuppliers);
    setSampleDataEnabled(true);
  }, [setSampleDataEnabled]);

  // Sample data summary
  const sampleDataSummary = useMemo(() => {
    const allEdmFlat = Object.values(edmCampaigns).flat();
    return getSampleDataSummary({
      websites,
      edmCampaigns: allEdmFlat,
      suppliers,
    });
  }, [websites, edmCampaigns, suppliers]);

  // ===== Helper: get website info for flattening =====
  const getWebsiteInfo = useCallback((wsId: string) => {
    const profile = filteredWebsites.find(p => p.id === wsId);
    return {
      websiteName: profile?.websiteName || wsId,
      company: profile?.company || '',
      brand: profile?.brand || '',
    };
  }, [filteredWebsites]);

  const allEdmCampaignsList = Object.entries(filteredEdmCampaigns).flatMap(([wsId, camps]) => {
    const info = getWebsiteInfo(wsId);
    return camps.map(c => ({ ...c, ...info }));
  });

  // ===== WEBSITE CRUD =====
  const addWebsite = useCallback((data: Omit<WebsiteProfileFull, 'id'>): WebsiteProfileFull => {
    const newWebsite: WebsiteProfileFull = { ...data, id: generateId('ws') };
    setWebsites(prev => [...prev, newWebsite]);
    return newWebsite;
  }, []);

  // Add a website that already has an ID (for syncing from other modules)
  const addWebsiteWithId = useCallback((website: WebsiteProfileFull): void => {
    setWebsites(prev => {
      // Avoid duplicates
      if (prev.some(w => w.id === website.id)) return prev;
      return [...prev, website];
    });
  }, []);

  const updateWebsite = useCallback((id: string, data: Partial<WebsiteProfileFull>) => {
    setWebsites(prev => prev.map(w => w.id === id ? { ...w, ...data } : w));
  }, []);

  const deleteWebsite = useCallback((id: string): IntegrityCheck => {
    const reasons: string[] = [];
    const wsEdm = edmCampaigns[id] || [];

    if (wsEdm.length > 0) reasons.push(`關聯了 ${wsEdm.length} 條 EDM 活動`);

    if (reasons.length > 0) {
      return {
        canDelete: false,
        reasons: [`無法刪除此網站，因為：`, ...reasons, `請先刪除相關資料後再嘗試。`],
      };
    }
    setWebsites(prev => prev.filter(w => w.id !== id));
    return { canDelete: true, reasons: [] };
  }, [edmCampaigns]);

  const getWebsiteById = useCallback((id: string) => filteredWebsites.find(w => w.id === id), [filteredWebsites]);

  // ===== EDM CAMPAIGN CRUD =====
  const addEdmCampaign = useCallback((websiteId: string, data: Omit<EdmCampaign, 'id'>): EdmCampaign => {
    const newCampaign: EdmCampaign = { ...data, id: generateId('edm') };
    setEdmCampaigns(prev => ({
      ...prev,
      [websiteId]: [...(prev[websiteId] || []), newCampaign],
    }));
    return newCampaign;
  }, []);

  const updateEdmCampaign = useCallback((websiteId: string, campaignId: string, data: Partial<EdmCampaign>) => {
    setEdmCampaigns(prev => ({
      ...prev,
      [websiteId]: (prev[websiteId] || []).map(c => c.id === campaignId ? { ...c, ...data } : c),
    }));
  }, []);

  const deleteEdmCampaign = useCallback((websiteId: string, campaignId: string): IntegrityCheck => {
    setEdmCampaigns(prev => ({
      ...prev,
      [websiteId]: (prev[websiteId] || []).filter(c => c.id !== campaignId),
    }));
    return { canDelete: true, reasons: [] };
  }, []);

  // ===== SUPPLIER CRUD =====
  const addSupplier = useCallback((data: Omit<SupplierData, 'id'>): SupplierData => {
    const newSupplier: SupplierData = { ...data, id: generateId('sup') };
    setSuppliers(prev => [...prev, newSupplier]);
    return newSupplier;
  }, []);

  const updateSupplier = useCallback((id: string, data: Partial<SupplierData>) => {
    setSuppliers(prev => prev.map(s => s.id === id ? { ...s, ...data } : s));
  }, []);

  const deleteSupplier = useCallback((id: string): IntegrityCheck => {
    setSuppliers(prev => prev.filter(s => s.id !== id));
    return { canDelete: true, reasons: [] };
  }, []);

  const value: DataStoreContextType = {
    websites: filteredWebsites, addWebsite, addWebsiteWithId, updateWebsite, deleteWebsite, getWebsiteById,
    edmCampaigns: filteredEdmCampaigns, allEdmCampaignsList, addEdmCampaign, updateEdmCampaign, deleteEdmCampaign,
    suppliers: filteredSuppliers, addSupplier, updateSupplier, deleteSupplier,
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
