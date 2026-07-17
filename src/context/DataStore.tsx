import React, { createContext, useContext, useState, useCallback, useMemo, ReactNode } from 'react';
import { Project, WebsiteProfileFull, SocialPost, PaidAd, SeoKeyword, EdmCampaign, Video, VideoChannel } from '@/types/app';
import { projects as initialProjects, companies, brands } from '@/data/mockData';
import { websiteProfiles as initialWebsites } from '@/data/websiteData';
import {
  websiteVideos as initialWebsiteVideos,
  websiteSocialPosts as initialWebsiteSocialPosts,
  websitePaidAds as initialWebsitePaidAds,
  websiteSeoKeywords as initialWebsiteSeoKeywords,
  websiteEdmCampaigns as initialWebsiteEdmCampaigns,
} from '@/data/websiteDetailData';
import { isSampleData, filterOutSampleData, getSampleDataSummary } from '@/data/sampleDataRegistry';

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

/** 網頁供應商主檔（反向連結可購買網站） */
export interface WebPageSupplier {
  id: string;
  name: string;
  platform: string;
  url: string;
  cost: number;
  currency: 'USD' | 'HKD';
  rating: number;
  createdAt?: string;
}

/** 反向連結購買紀錄 */
export interface BacklinkPurchase {
  id: string;
  websiteProfileId?: string;
  webSupplierId: string;
  cost: number;
  currency: 'USD' | 'HKD';
  purchaseDate: string;
  quantity: number;
  notes?: string;
}

/** Google Business 登記紀錄 */
export interface GoogleBusinessRegistration {
  id: string;
  websiteProfileId?: string;
  url: string;
  registeredAt: string;
  content: string;
}

// ===== Integrity check result =====
export interface IntegrityCheck {
  canDelete: boolean;
  reasons: string[];
}

// ===== Data Store Context =====
interface DataStoreContextType {
  // Projects
  projects: Project[];
  addProject: (project: Omit<Project, 'id'>) => Project;
  updateProject: (id: string, data: Partial<Project>) => void;
  deleteProject: (id: string) => IntegrityCheck;
  getProjectById: (id: string) => Project | undefined;

  // Websites
  websites: WebsiteProfileFull[];
  addWebsite: (website: Omit<WebsiteProfileFull, 'id'>) => WebsiteProfileFull;
  addWebsiteWithId: (website: WebsiteProfileFull) => void;
  updateWebsite: (id: string, data: Partial<WebsiteProfileFull>) => void;
  deleteWebsite: (id: string) => IntegrityCheck;
  getWebsiteById: (id: string) => WebsiteProfileFull | undefined;

  // Videos
  videos: Record<string, Video[]>;
  allVideosList: (Video & { websiteName: string; company: string; brand: string })[];
  addVideo: (websiteId: string, video: Omit<Video, 'id'>) => Video;
  updateVideo: (websiteId: string, videoId: string, data: Partial<Video>) => void;
  deleteVideo: (websiteId: string, videoId: string) => IntegrityCheck;

  // Video Channels
  videoChannels: VideoChannel[];
  addVideoChannel: (channel: Omit<VideoChannel, 'id'>) => VideoChannel;
  updateVideoChannel: (id: string, data: Partial<VideoChannel>) => void;
  deleteVideoChannel: (id: string) => IntegrityCheck;

  // Social Posts
  socialPosts: Record<string, SocialPost[]>;
  allSocialPostsList: (SocialPost & { websiteName: string; company: string; brand: string })[];
  addSocialPost: (websiteId: string, post: Omit<SocialPost, 'id'>) => SocialPost;
  updateSocialPost: (websiteId: string, postId: string, data: Partial<SocialPost>) => void;
  deleteSocialPost: (websiteId: string, postId: string) => IntegrityCheck;

  // Paid Ads
  paidAds: Record<string, PaidAd[]>;
  allPaidAdsList: (PaidAd & { websiteName: string; company: string; brand: string })[];
  addPaidAd: (websiteId: string, ad: Omit<PaidAd, 'id'>) => PaidAd;
  updatePaidAd: (websiteId: string, adId: string, data: Partial<PaidAd>) => void;
  deletePaidAd: (websiteId: string, adId: string) => IntegrityCheck;

  // SEO Keywords
  seoKeywords: Record<string, SeoKeyword[]>;
  allSeoKeywordsList: (SeoKeyword & { websiteName: string; company: string; brand: string })[];
  addSeoKeyword: (websiteId: string, keyword: Omit<SeoKeyword, 'id'>) => SeoKeyword;
  updateSeoKeyword: (websiteId: string, keywordId: string, data: Partial<SeoKeyword>) => void;
  deleteSeoKeyword: (websiteId: string, keywordId: string) => IntegrityCheck;

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

  // Web Page Suppliers (網頁供應商)
  webPageSuppliers: WebPageSupplier[];
  addWebPageSupplier: (supplier: Omit<WebPageSupplier, 'id'>) => WebPageSupplier;
  updateWebPageSupplier: (id: string, data: Partial<WebPageSupplier>) => void;
  deleteWebPageSupplier: (id: string) => IntegrityCheck;
  getWebPageSupplierById: (id: string) => WebPageSupplier | undefined;

  // Backlink Purchases (反向連結)
  backlinkPurchases: BacklinkPurchase[];
  addBacklinkPurchase: (purchase: Omit<BacklinkPurchase, 'id'>) => BacklinkPurchase;
  updateBacklinkPurchase: (id: string, data: Partial<BacklinkPurchase>) => void;
  deleteBacklinkPurchase: (id: string) => IntegrityCheck;

  // Google Business registrations
  googleBusinessRegistrations: GoogleBusinessRegistration[];
  addGoogleBusinessRegistration: (record: Omit<GoogleBusinessRegistration, 'id'>) => GoogleBusinessRegistration;
  updateGoogleBusinessRegistration: (id: string, data: Partial<GoogleBusinessRegistration>) => void;
  deleteGoogleBusinessRegistration: (id: string) => IntegrityCheck;

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

const initialWebPageSuppliers: (WebPageSupplier & { __sampleData: true })[] = [
  { __sampleData: true, id: 'wps1', name: 'LinkBuilder HK', platform: 'LinkBuilding.com', url: 'https://www.techreview.hk', cost: 120, currency: 'USD', rating: 4, createdAt: '2024-10-01' },
  { __sampleData: true, id: 'wps2', name: 'Asia PR Net', platform: 'GuestPost.io', url: 'https://www.asianbiz.news', cost: 800, currency: 'HKD', rating: 5, createdAt: '2024-11-05' },
  { __sampleData: true, id: 'wps3', name: 'Domain Authority Pro', platform: 'SEMrush Marketplace', url: 'https://www.lifestylemag.com', cost: 250, currency: 'USD', rating: 3, createdAt: '2024-12-01' },
];

const initialBacklinkPurchases: (BacklinkPurchase & { __sampleData: true })[] = [
  { __sampleData: true, id: 'bl1', websiteProfileId: 'ws1', webSupplierId: 'wps1', cost: 120, currency: 'USD', purchaseDate: '2025-01-15', quantity: 3, notes: 'BW Wine 首批外鏈' },
  { __sampleData: true, id: 'bl2', websiteProfileId: 'ws2', webSupplierId: 'wps2', cost: 1600, currency: 'HKD', purchaseDate: '2025-02-20', quantity: 2 },
  { __sampleData: true, id: 'bl3', websiteProfileId: 'ws1', webSupplierId: 'wps1', cost: 200, currency: 'USD', purchaseDate: '2025-03-10', quantity: 5 },
];

const initialGoogleBusinessRegistrations: (GoogleBusinessRegistration & { __sampleData: true })[] = [
  { __sampleData: true, id: 'gb1', websiteProfileId: 'ws1', url: 'https://g.page/bw-wine-hongkong', registeredAt: '2025-01-08', content: 'BW Wine 尖沙咀門市 — 營業時間、地址、品酒活動資訊' },
  { __sampleData: true, id: 'gb2', websiteProfileId: 'ws2', url: 'https://maps.app.goo.gl/aci-events', registeredAt: '2025-02-14', content: 'ACI Events 辦公室 — 聯絡電話、服務範圍、最新活動' },
];

// Initial video channels (模擬數據)
const initialVideoChannels: (VideoChannel & { __sampleData: true })[] = [
  { __sampleData: true, id: 'vc1', channelNumber: 'CH-001', internalName: 'BW 品牌主頻道', publicName: 'BW Wine Official', importance: 'A1', deviceType: 'both', brand: 'BW', status: 'active', videoCount: 45 },
  { __sampleData: true, id: 'vc2', channelNumber: 'CH-002', internalName: 'ACI 活動花絮', publicName: 'ACI Events', importance: 'A2', deviceType: 'both', brand: 'ACI', status: 'active', videoCount: 28 },
  { __sampleData: true, id: 'vc3', channelNumber: 'CH-003', internalName: '品酒教學系列', publicName: 'Wine Academy', importance: 'A1', deviceType: 'desktop', brand: 'BW', status: 'active', videoCount: 32 },
  { __sampleData: true, id: 'vc4', channelNumber: 'CH-004', internalName: 'FCC 短視頻', publicName: 'FCC Clips', importance: 'A3', deviceType: 'mobile', brand: 'FCC', status: 'active', videoCount: 15 },
  { __sampleData: true, id: 'vc5', channelNumber: 'CH-005', internalName: 'BSC 設計案例', publicName: 'BSC Portfolio', importance: 'A4', deviceType: 'desktop', brand: 'BSC', status: 'paused', videoCount: 8 },
  { __sampleData: true, id: 'vc6', channelNumber: 'CH-006', internalName: '內部培訓影片', publicName: 'Training Videos', importance: 'A5', deviceType: 'both', brand: 'BW', status: 'active', videoCount: 12 },
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

  // State
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [websites, setWebsites] = useState<WebsiteProfileFull[]>(initialWebsites);
  const [videos, setVideos] = useState<Record<string, Video[]>>(initialWebsiteVideos);
  const [videoChannels, setVideoChannels] = useState<VideoChannel[]>(initialVideoChannels);
  const [socialPosts, setSocialPosts] = useState<Record<string, SocialPost[]>>(initialWebsiteSocialPosts);
  const [paidAds, setPaidAds] = useState<Record<string, PaidAd[]>>(initialWebsitePaidAds);
  const [seoKeywords, setSeoKeywords] = useState<Record<string, SeoKeyword[]>>(initialWebsiteSeoKeywords);
  const [edmCampaigns, setEdmCampaigns] = useState<Record<string, EdmCampaign[]>>(initialWebsiteEdmCampaigns);
  const [suppliers, setSuppliers] = useState<SupplierData[]>(initialSuppliers);
  const [webPageSuppliers, setWebPageSuppliers] = useState<WebPageSupplier[]>(initialWebPageSuppliers);
  const [backlinkPurchases, setBacklinkPurchases] = useState<BacklinkPurchase[]>(initialBacklinkPurchases);
  const [googleBusinessRegistrations, setGoogleBusinessRegistrations] = useState<GoogleBusinessRegistration[]>(initialGoogleBusinessRegistrations);

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
  const filteredProjects = useMemo(() => filterIfNeeded(projects), [projects, filterIfNeeded]);
  const filteredWebsites = useMemo(() => filterIfNeeded(websites), [websites, filterIfNeeded]);
  const filteredVideos = useMemo(() => filterRecordIfNeeded(videos), [videos, filterRecordIfNeeded]);
  const filteredVideoChannels = useMemo(() => filterIfNeeded(videoChannels), [videoChannels, filterIfNeeded]);
  const filteredSocialPosts = useMemo(() => filterRecordIfNeeded(socialPosts), [socialPosts, filterRecordIfNeeded]);
  const filteredPaidAds = useMemo(() => filterRecordIfNeeded(paidAds), [paidAds, filterRecordIfNeeded]);
  const filteredSeoKeywords = useMemo(() => filterRecordIfNeeded(seoKeywords), [seoKeywords, filterRecordIfNeeded]);
  const filteredEdmCampaigns = useMemo(() => filterRecordIfNeeded(edmCampaigns), [edmCampaigns, filterRecordIfNeeded]);
  const filteredSuppliers = useMemo(() => filterIfNeeded(suppliers), [suppliers, filterIfNeeded]);
  const filteredWebPageSuppliers = useMemo(() => filterIfNeeded(webPageSuppliers), [webPageSuppliers, filterIfNeeded]);
  const filteredBacklinkPurchases = useMemo(() => filterIfNeeded(backlinkPurchases), [backlinkPurchases, filterIfNeeded]);
  const filteredGoogleBusinessRegistrations = useMemo(
    () => filterIfNeeded(googleBusinessRegistrations),
    [googleBusinessRegistrations, filterIfNeeded],
  );

  // Clear all sample data permanently
  const clearAllSampleData = useCallback(() => {
    setProjects(prev => filterOutSampleData(prev));
    setWebsites(prev => filterOutSampleData(prev));
    setVideoChannels(prev => filterOutSampleData(prev));
    setSuppliers(prev => filterOutSampleData(prev));
    setWebPageSuppliers(prev => filterOutSampleData(prev));
    setBacklinkPurchases(prev => filterOutSampleData(prev));
    setGoogleBusinessRegistrations(prev => filterOutSampleData(prev));
    setVideos(prev => {
      const result: Record<string, Video[]> = {};
      for (const [k, v] of Object.entries(prev)) {
        const filtered = filterOutSampleData(v);
        if (filtered.length > 0) result[k] = filtered;
      }
      return result;
    });
    setSocialPosts(prev => {
      const result: Record<string, SocialPost[]> = {};
      for (const [k, v] of Object.entries(prev)) {
        const filtered = filterOutSampleData(v);
        if (filtered.length > 0) result[k] = filtered;
      }
      return result;
    });
    setPaidAds(prev => {
      const result: Record<string, PaidAd[]> = {};
      for (const [k, v] of Object.entries(prev)) {
        const filtered = filterOutSampleData(v);
        if (filtered.length > 0) result[k] = filtered;
      }
      return result;
    });
    setSeoKeywords(prev => {
      const result: Record<string, SeoKeyword[]> = {};
      for (const [k, v] of Object.entries(prev)) {
        const filtered = filterOutSampleData(v);
        if (filtered.length > 0) result[k] = filtered;
      }
      return result;
    });
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
    setProjects(initialProjects);
    setWebsites(initialWebsites);
    setVideos(initialWebsiteVideos);
    setVideoChannels(initialVideoChannels);
    setSocialPosts(initialWebsiteSocialPosts);
    setPaidAds(initialWebsitePaidAds);
    setSeoKeywords(initialWebsiteSeoKeywords);
    setEdmCampaigns(initialWebsiteEdmCampaigns);
    setSuppliers(initialSuppliers);
    setWebPageSuppliers(initialWebPageSuppliers);
    setBacklinkPurchases(initialBacklinkPurchases);
    setGoogleBusinessRegistrations(initialGoogleBusinessRegistrations);
    setSampleDataEnabled(true);
  }, [setSampleDataEnabled]);

  // Sample data summary
  const sampleDataSummary = useMemo(() => {
    const allVideosFlat = Object.values(videos).flat();
    const allPostsFlat = Object.values(socialPosts).flat();
    const allAdsFlat = Object.values(paidAds).flat();
    const allKwsFlat = Object.values(seoKeywords).flat();
    const allEdmFlat = Object.values(edmCampaigns).flat();
    return getSampleDataSummary({
      projects,
      websites,
      videos: allVideosFlat,
      videoChannels,
      socialPosts: allPostsFlat,
      paidAds: allAdsFlat,
      seoKeywords: allKwsFlat,
      edmCampaigns: allEdmFlat,
      suppliers,
      webPageSuppliers,
      backlinkPurchases,
      googleBusinessRegistrations,
    });
  }, [projects, websites, videos, videoChannels, socialPosts, paidAds, seoKeywords, edmCampaigns, suppliers, webPageSuppliers, backlinkPurchases, googleBusinessRegistrations]);

  // ===== Helper: get website info for flattening =====
  const getWebsiteInfo = useCallback((wsId: string) => {
    const profile = filteredWebsites.find(p => p.id === wsId);
    return {
      websiteName: profile?.websiteName || wsId,
      company: profile?.company || '',
      brand: profile?.brand || '',
    };
  }, [filteredWebsites]);

  // ===== Flattened lists =====
  const allVideosList = Object.entries(filteredVideos).flatMap(([wsId, vids]) => {
    const info = getWebsiteInfo(wsId);
    return vids.map(v => ({ ...v, ...info }));
  });

  const allSocialPostsList = Object.entries(filteredSocialPosts).flatMap(([wsId, posts]) => {
    const info = getWebsiteInfo(wsId);
    return posts.map(p => ({ ...p, ...info }));
  });

  const allPaidAdsList = Object.entries(filteredPaidAds).flatMap(([wsId, ads]) => {
    const info = getWebsiteInfo(wsId);
    return ads.map(a => ({ ...a, ...info }));
  });

  const allSeoKeywordsList = Object.entries(filteredSeoKeywords).flatMap(([wsId, kws]) => {
    const info = getWebsiteInfo(wsId);
    return kws.map(k => ({ ...k, ...info }));
  });

  const allEdmCampaignsList = Object.entries(filteredEdmCampaigns).flatMap(([wsId, camps]) => {
    const info = getWebsiteInfo(wsId);
    return camps.map(c => ({ ...c, ...info }));
  });

  // ===== PROJECT CRUD =====
  const addProject = useCallback((data: Omit<Project, 'id'>): Project => {
    const newProject: Project = { ...data, id: generateId('p') };
    setProjects(prev => [...prev, newProject]);
    return newProject;
  }, []);

  const updateProject = useCallback((id: string, data: Partial<Project>) => {
    setProjects(prev => prev.map(p => p.id === id ? { ...p, ...data } : p));
  }, []);

  const deleteProject = useCallback((id: string): IntegrityCheck => {
    const linkedWebsites = websites.filter(w => w.projectId === id);
    if (linkedWebsites.length > 0) {
      return {
        canDelete: false,
        reasons: [`此項目關聯了 ${linkedWebsites.length} 個網站（${linkedWebsites.map(w => w.websiteName).join(', ')}），請先移除或重新分配網站後再刪除項目。`],
      };
    }
    setProjects(prev => prev.filter(p => p.id !== id));
    return { canDelete: true, reasons: [] };
  }, [websites]);

  const getProjectById = useCallback((id: string) => filteredProjects.find(p => p.id === id), [filteredProjects]);

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
    const wsVideos = videos[id] || [];
    const wsPosts = socialPosts[id] || [];
    const wsAds = paidAds[id] || [];
    const wsKeywords = seoKeywords[id] || [];
    const wsEdm = edmCampaigns[id] || [];
    
    if (wsVideos.length > 0) reasons.push(`關聯了 ${wsVideos.length} 條影片記錄`);
    if (wsPosts.length > 0) reasons.push(`關聯了 ${wsPosts.length} 條社交媒體帖文`);
    if (wsAds.length > 0) reasons.push(`關聯了 ${wsAds.length} 條付費廣告`);
    if (wsKeywords.length > 0) reasons.push(`關聯了 ${wsKeywords.length} 個 SEO 關鍵字`);
    if (wsEdm.length > 0) reasons.push(`關聯了 ${wsEdm.length} 條 EDM 活動`);

    if (reasons.length > 0) {
      return {
        canDelete: false,
        reasons: [`無法刪除此網站，因為：`, ...reasons, `請先刪除相關資料後再嘗試。`],
      };
    }
    setWebsites(prev => prev.filter(w => w.id !== id));
    return { canDelete: true, reasons: [] };
  }, [videos, socialPosts, paidAds, seoKeywords, edmCampaigns]);

  const getWebsiteById = useCallback((id: string) => filteredWebsites.find(w => w.id === id), [filteredWebsites]);

  // ===== VIDEO CRUD =====
  const addVideo = useCallback((websiteId: string, data: Omit<Video, 'id'>): Video => {
    const newVideo: Video = { ...data, id: generateId('v') };
    setVideos(prev => ({
      ...prev,
      [websiteId]: [...(prev[websiteId] || []), newVideo],
    }));
    return newVideo;
  }, []);

  const updateVideo = useCallback((websiteId: string, videoId: string, data: Partial<Video>) => {
    setVideos(prev => ({
      ...prev,
      [websiteId]: (prev[websiteId] || []).map(v => v.id === videoId ? { ...v, ...data } : v),
    }));
  }, []);

  const deleteVideo = useCallback((websiteId: string, videoId: string): IntegrityCheck => {
    // Videos linked to social posts?
    const linkedPosts = allSocialPostsList.filter(p => p.content?.includes(videoId));
    if (linkedPosts.length > 0) {
      return { canDelete: false, reasons: [`此影片被 ${linkedPosts.length} 條社交帖文引用。`] };
    }
    setVideos(prev => ({
      ...prev,
      [websiteId]: (prev[websiteId] || []).filter(v => v.id !== videoId),
    }));
    return { canDelete: true, reasons: [] };
  }, [allSocialPostsList]);

  // ===== VIDEO CHANNEL CRUD =====
  const addVideoChannel = useCallback((data: Omit<VideoChannel, 'id'>): VideoChannel => {
    const newChannel: VideoChannel = { ...data, id: generateId('vc') };
    setVideoChannels(prev => [...prev, newChannel]);
    return newChannel;
  }, []);

  const updateVideoChannel = useCallback((id: string, data: Partial<VideoChannel>) => {
    setVideoChannels(prev => prev.map(c => c.id === id ? { ...c, ...data } : c));
  }, []);

  const deleteVideoChannel = useCallback((id: string): IntegrityCheck => {
    const channel = videoChannels.find(c => c.id === id);
    const linkedVideos = allVideosList.filter(v => v.videoChannelId === id);
    if (linkedVideos.length > 0) {
      return { canDelete: false, reasons: [`此頻道（${channel?.internalName}）關聯了 ${linkedVideos.length} 條影片，請先移除影片或更換頻道。`] };
    }
    setVideoChannels(prev => prev.filter(c => c.id !== id));
    return { canDelete: true, reasons: [] };
  }, [videoChannels, allVideosList]);

  // ===== SOCIAL POST CRUD =====
  const addSocialPost = useCallback((websiteId: string, data: Omit<SocialPost, 'id'>): SocialPost => {
    const newPost: SocialPost = { ...data, id: generateId('sp') };
    setSocialPosts(prev => ({
      ...prev,
      [websiteId]: [...(prev[websiteId] || []), newPost],
    }));
    return newPost;
  }, []);

  const updateSocialPost = useCallback((websiteId: string, postId: string, data: Partial<SocialPost>) => {
    setSocialPosts(prev => ({
      ...prev,
      [websiteId]: (prev[websiteId] || []).map(p => p.id === postId ? { ...p, ...data } : p),
    }));
  }, []);

  const deleteSocialPost = useCallback((_websiteId: string, _postId: string): IntegrityCheck => {
    setSocialPosts(prev => ({
      ...prev,
      [_websiteId]: (prev[_websiteId] || []).filter(p => p.id !== _postId),
    }));
    return { canDelete: true, reasons: [] };
  }, []);

  // ===== PAID AD CRUD =====
  const addPaidAd = useCallback((websiteId: string, data: Omit<PaidAd, 'id'>): PaidAd => {
    const newAd: PaidAd = { ...data, id: generateId('ad') };
    setPaidAds(prev => ({
      ...prev,
      [websiteId]: [...(prev[websiteId] || []), newAd],
    }));
    return newAd;
  }, []);

  const updatePaidAd = useCallback((websiteId: string, adId: string, data: Partial<PaidAd>) => {
    setPaidAds(prev => ({
      ...prev,
      [websiteId]: (prev[websiteId] || []).map(a => a.id === adId ? { ...a, ...data } : a),
    }));
  }, []);

  const deletePaidAd = useCallback((websiteId: string, adId: string): IntegrityCheck => {
    setPaidAds(prev => ({
      ...prev,
      [websiteId]: (prev[websiteId] || []).filter(a => a.id !== adId),
    }));
    return { canDelete: true, reasons: [] };
  }, []);

  // ===== SEO KEYWORD CRUD =====
  const addSeoKeyword = useCallback((websiteId: string, data: Omit<SeoKeyword, 'id'>): SeoKeyword => {
    const newKw: SeoKeyword = { ...data, id: generateId('sk') };
    setSeoKeywords(prev => ({
      ...prev,
      [websiteId]: [...(prev[websiteId] || []), newKw],
    }));
    return newKw;
  }, []);

  const updateSeoKeyword = useCallback((websiteId: string, keywordId: string, data: Partial<SeoKeyword>) => {
    setSeoKeywords(prev => ({
      ...prev,
      [websiteId]: (prev[websiteId] || []).map(k => k.id === keywordId ? { ...k, ...data } : k),
    }));
  }, []);

  const deleteSeoKeyword = useCallback((websiteId: string, keywordId: string): IntegrityCheck => {
    // Check if keyword is linked to an article
    const kw = (seoKeywords[websiteId] || []).find(k => k.id === keywordId);
    if (kw?.assignedArticleId) {
      return { canDelete: false, reasons: [`此關鍵字已分配給文章（ID: ${kw.assignedArticleId}），請先解除文章關聯。`] };
    }
    setSeoKeywords(prev => ({
      ...prev,
      [websiteId]: (prev[websiteId] || []).filter(k => k.id !== keywordId),
    }));
    return { canDelete: true, reasons: [] };
  }, [seoKeywords]);

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
    // Check if supplier is referenced in SEO upgrades (would be via paidAds supplier references)
    // For now, suppliers can be freely deleted as they're not FK-linked to other tables heavily
    setSuppliers(prev => prev.filter(s => s.id !== id));
    return { canDelete: true, reasons: [] };
  }, []);

  // ===== WEB PAGE SUPPLIER CRUD =====
  const addWebPageSupplier = useCallback((data: Omit<WebPageSupplier, 'id'>): WebPageSupplier => {
    const newSupplier: WebPageSupplier = {
      ...data,
      id: generateId('wps'),
      createdAt: data.createdAt || new Date().toISOString().split('T')[0],
    };
    setWebPageSuppliers(prev => [...prev, newSupplier]);
    return newSupplier;
  }, []);

  const updateWebPageSupplier = useCallback((id: string, data: Partial<WebPageSupplier>) => {
    setWebPageSuppliers(prev => prev.map(s => s.id === id ? { ...s, ...data } : s));
  }, []);

  const deleteWebPageSupplier = useCallback((id: string): IntegrityCheck => {
    const refs = backlinkPurchases.filter(p => p.webSupplierId === id);
    if (refs.length > 0) {
      return {
        canDelete: false,
        reasons: [`此網頁供應商仍有 ${refs.length} 筆反向連結購買紀錄，無法刪除`],
      };
    }
    setWebPageSuppliers(prev => prev.filter(s => s.id !== id));
    return { canDelete: true, reasons: [] };
  }, [backlinkPurchases]);

  const getWebPageSupplierById = useCallback(
    (id: string) => webPageSuppliers.find(s => s.id === id),
    [webPageSuppliers],
  );

  // ===== BACKLINK PURCHASE CRUD =====
  const addBacklinkPurchase = useCallback((data: Omit<BacklinkPurchase, 'id'>): BacklinkPurchase => {
    const newPurchase: BacklinkPurchase = { ...data, id: generateId('bl') };
    setBacklinkPurchases(prev => [...prev, newPurchase]);
    return newPurchase;
  }, []);

  const updateBacklinkPurchase = useCallback((id: string, data: Partial<BacklinkPurchase>) => {
    setBacklinkPurchases(prev => prev.map(p => p.id === id ? { ...p, ...data } : p));
  }, []);

  const deleteBacklinkPurchase = useCallback((id: string): IntegrityCheck => {
    setBacklinkPurchases(prev => prev.filter(p => p.id !== id));
    return { canDelete: true, reasons: [] };
  }, []);

  // ===== GOOGLE BUSINESS REGISTRATION CRUD =====
  const addGoogleBusinessRegistration = useCallback(
    (data: Omit<GoogleBusinessRegistration, 'id'>): GoogleBusinessRegistration => {
      const newRecord: GoogleBusinessRegistration = { ...data, id: generateId('gb') };
      setGoogleBusinessRegistrations(prev => [...prev, newRecord]);
      return newRecord;
    },
    [],
  );

  const updateGoogleBusinessRegistration = useCallback(
    (id: string, data: Partial<GoogleBusinessRegistration>) => {
      setGoogleBusinessRegistrations(prev => prev.map(r => (r.id === id ? { ...r, ...data } : r)));
    },
    [],
  );

  const deleteGoogleBusinessRegistration = useCallback((id: string): IntegrityCheck => {
    setGoogleBusinessRegistrations(prev => prev.filter(r => r.id !== id));
    return { canDelete: true, reasons: [] };
  }, []);

  const value: DataStoreContextType = {
    projects: filteredProjects, addProject, updateProject, deleteProject, getProjectById,
    websites: filteredWebsites, addWebsite, addWebsiteWithId, updateWebsite, deleteWebsite, getWebsiteById,
    videos: filteredVideos, allVideosList, addVideo, updateVideo, deleteVideo,
    videoChannels: filteredVideoChannels, addVideoChannel, updateVideoChannel, deleteVideoChannel,
    socialPosts: filteredSocialPosts, allSocialPostsList, addSocialPost, updateSocialPost, deleteSocialPost,
    paidAds: filteredPaidAds, allPaidAdsList, addPaidAd, updatePaidAd, deletePaidAd,
    seoKeywords: filteredSeoKeywords, allSeoKeywordsList, addSeoKeyword, updateSeoKeyword, deleteSeoKeyword,
    edmCampaigns: filteredEdmCampaigns, allEdmCampaignsList, addEdmCampaign, updateEdmCampaign, deleteEdmCampaign,
    suppliers: filteredSuppliers, addSupplier, updateSupplier, deleteSupplier,
    webPageSuppliers: filteredWebPageSuppliers, addWebPageSupplier, updateWebPageSupplier, deleteWebPageSupplier, getWebPageSupplierById,
    backlinkPurchases: filteredBacklinkPurchases, addBacklinkPurchase, updateBacklinkPurchase, deleteBacklinkPurchase,
    googleBusinessRegistrations: filteredGoogleBusinessRegistrations,
    addGoogleBusinessRegistration,
    updateGoogleBusinessRegistration,
    deleteGoogleBusinessRegistration,
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
