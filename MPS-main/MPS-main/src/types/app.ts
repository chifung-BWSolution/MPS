export type UserRole = 'management' | 'project_manager' | 'designer' | 'accountant' | 'copywriter' | 'video_editor' | 'marketing' | 'staff';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar?: string;
  department?: string;
  isActive?: boolean;
  hiredDate?: string;
  accessibleCompanies?: string[];
}

// === Company (Top Level) ===
export interface Company {
  id: string;
  companyCode: string;
  companyNameZh: string;
  companyNameEn: string;
  brNo: string;
  bankName: string;
  bankAccount: string;
  address: string;
  contactPerson: string;
  contactPhone: string;
  contactEmail: string;
  logoUrl?: string;
  isActive: boolean;
  brandCount?: number;
  activeProjectCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

// === Brand (belongs to Company) ===
export interface Brand {
  id: string;
  companyId: string;
  brandCode: string;
  brandNameZh: string;
  brandNameEn: string;
  industry?: string;
  logoUrl?: string;
  officialUrl?: string;
  primaryColor: string;
  description?: string;
  isActive: boolean;
  projectCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

// === Year Plan ===
export interface YearPlan {
  id: string;
  companyId: string;
  brandId: string;
  year: number;
  targetRevenue: number;
  targetProjects: number;
  targetArticles: number;
  targetVideos: number;
  targetSocialPosts: number;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type ProjectType = 'web_design' | 'system' | 'graphic_design' | 'event' | 'wine' | 'branding' | 'marketing' | 'video' | 'social_media' | 'edm' | 'paid_ads' | 'seo_upgrade' | 'other';

export type BillingModel = 'one_time' | 'recurring';
export type BillingFrequency = 'monthly' | 'quarterly' | 'semi_annual' | 'annual';

export interface ClientTag {
  id: string;
  label: string;
  color: string;
}

export interface ClientInfo {
  companyName: string;
  contactPerson: string;
  primaryPhone: string;
  companyPhone: string;
  email: string;
  website: string;
  tags: string[];
}
export type ProjectCategory = 'internal' | 'client';
export type ProjectStatus = 'planning' | 'active' | 'on_hold' | 'completed' | 'cancelled';
export type ProjectPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface ProjectTask {
  id: string;
  projectId: string;
  title: string;
  assignee: string;
  assigneeId?: string;
  startDate?: string;
  endDate?: string;
  status: 'todo' | 'in_progress' | 'review' | 'done';
  priority: ProjectPriority;
  estimatedHours?: number;
  actualHours?: number;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface NavItem {
  id: string;
  label: string;
  icon: string;
  path: string;
  children?: NavItem[];
  roles?: UserRole[];
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'success' | 'error';
  severity: 'info' | 'warning' | 'critical';
  read: boolean;
  actionUrl?: string;
  createdAt: string;
}

export interface Project {
  id: string;
  name: string;
  clientName?: string;
  companyId: string;
  brandId: string;
  projectType: ProjectType;
  projectCategory: ProjectCategory;
  status: ProjectStatus;
  progress: number;
  assignedPm?: string;
  assignedPmId?: string;
  brand?: string;
  company?: string;
  budgetTotal: number;
  budgetUsed: number;
  startDate: string;
  endDate?: string;
  description?: string;
  priority: ProjectPriority;
  tasks?: ProjectTask[];
  // Billing model fields
  billingModel?: BillingModel;
  billingFrequency?: BillingFrequency;
  contractStartDate?: string;
  contractDuration?: number; // in months
  estimatedHours?: number;
  // Client info
  clientInfo?: ClientInfo;
  // Service items & delivery schedule (combined)
  serviceItems?: ServiceItem[];
}

export interface ServiceItem {
  id: string;
  serviceType: ProjectType;
  quantity: number;
  unit: string;
  deliveryDate: string;
  notes?: string;
}

// Website Level (1-5)
export type WebsiteLevel = 1 | 2 | 3 | 4 | 5;

export interface WebsiteProfile {
  id: string;
  projectId: string;
  websiteName: string;
  domainUrl?: string;
  platform: 'wordpress' | 'custom' | 'shopify' | 'wix' | 'framer' | 'other';
  hostingProvider?: string;
  brand?: string;
  level: WebsiteLevel;
  status: 'development' | 'live' | 'maintenance' | 'archived';
  assignedStaff?: { userId: string; role: string }[];
  externalLinks?: { label: string; url: string; type: string }[];
  notes?: string;
}

export interface VideoChannel {
  id: string;
  channelNumber: string;
  internalName: string;
  publicName: string;
  importance: 'A1' | 'A2' | 'A3' | 'A4' | 'A5';
  deviceType: 'desktop' | 'mobile' | 'both';
  brand: string;
  status: 'active' | 'paused' | 'archived';
  videoCount: number;
}

export interface Video {
  id: string;
  websiteProfileId?: string;
  videoChannelId?: string;
  title: string;
  description?: string;
  videoType: 'promo' | 'tutorial' | 'testimonial' | 'event' | 'social_clip';
  status: 'planning' | 'shooting' | 'post_production' | 'completed' | 'published';
  shootDate?: string;
  publishDate?: string;
  durationSeconds?: number;
  thumbnailUrl?: string;
  fileUrl?: string;
  editorId?: string;
  editingHours?: number;
  platforms?: { platform: string; url: string; views: number; publishDate?: string; status: string }[];
  crew?: { userId: string; role: string }[];
  notes?: string;
}

export interface VideoUpload {
  id: string;
  videoId: string;
  platform: 'youtube' | 'facebook' | 'instagram' | 'tiktok' | 'xiaohongshu' | 'website_embed' | 'other';
  uploadStatus: 'pending' | 'uploaded' | 'scheduled';
  uploadDate?: string;
  videoUrl?: string;
  views?: number;
}

export interface Article {
  id: string;
  websiteProfileId?: string;
  companyId?: string;
  brandId?: string;
  title: string;
  slug?: string;
  channel: 'website_article' | 'youtube' | 'facebook' | 'instagram' | 'xiaohongshu' | 'other_video';
  contentStatus: 'draft' | 'writing' | 'review' | 'published';
  authorId?: string;
  authorName?: string;
  wordCount?: number;
  hoursSpent?: number;
  targetKeywords?: { keyword: string; level: string }[];
  otherTags?: string[];
  publishDate?: string;
  url?: string;
  seoScore?: number;
  brand?: string;
  company?: string;
}

// Junction table: many-to-many relationship between websites and articles
export interface WebsiteArticle {
  id: string;
  websiteProfileId: string;
  articleId: string;
  addedDate: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

// Profile Type for Website+System module
export type ProfileType = 'website' | 'system';
export type SystemType = 'internal_tool' | 'client_system' | 'saas_platform' | 'erp' | 'crm' | 'other';

// Enhanced WebsiteProfile with company/brand
export interface WebsiteProfileFull {
  id: string;
  projectId?: string;
  companyId: string;
  brandId: string;
  websiteName: string;
  domainUrl?: string;
  platform: 'wordpress' | 'custom' | 'shopify' | 'wix' | 'framer' | 'other';
  hostingProvider?: string;
  company?: string;
  brand?: string;
  level: WebsiteLevel;
  status: 'development' | 'live' | 'maintenance' | 'archived';
  assignedStaff?: { userId: string; role: string; name: string }[];
  externalLinks?: { label: string; url: string }[];
  notes?: string;
  pagesCount: number;
  articlesCount: number;
  videosCount: number;
  socialPostsCount: number;
  keywordsCount: number;
  pluginsCount: number;
  totalHours: number;
  budgetTotal?: number;
  budgetUsed?: number;
  // v2.3: Profile type (website or system)
  profileType?: ProfileType;
  // System-specific fields
  systemType?: SystemType;
  techStack?: string[];
  deploymentEnv?: string;
  apiDocUrl?: string;
}

export interface SocialPost {
  id: string;
  websiteProfileId: string;
  platform: 'facebook' | 'instagram' | 'xiaohongshu' | 'linkedin' | 'youtube' | 'tiktok' | 'twitter' | 'other';
  platforms?: string[]; // v2.3: Multi-platform selection
  topic?: string; // v2.3: Topic/theme tag
  postType: 'image' | 'video' | 'carousel' | 'story' | 'reel';
  content: string;
  mediaUrls?: string[];
  scheduledDate?: string;
  publishedDate?: string;
  publishTime?: string;
  status: 'draft' | 'scheduled' | 'published' | 'archived';
  engagementData?: { likes: number; comments: number; shares: number; reach: number; impressions: number };
  authorId?: string;
  hoursSpent?: number;
  postUrl?: string;
  tags?: string[];
}

export interface PaidAd {
  id: string;
  websiteProfileId?: string;
  projectId?: string;
  campaignName: string;
  platform: 'google_ads' | 'facebook' | 'instagram' | 'xiaohongshu' | 'other';
  adType: 'search' | 'display' | 'video' | 'shopping' | 'social';
  projectTypeLabel?: string;
  budget: number;
  actualSpend: number;
  currency: 'HKD' | 'USD' | 'CNY';
  startDate: string;
  endDate?: string;
  status: 'planning' | 'active' | 'paused' | 'completed';
  targetAudience?: string;
  impressions?: number;
  clicks?: number;
  conversions?: number;
  cpc?: number;
  ctr?: number;
  roas?: number;
  creditCardId?: string;
  notes?: string;
}

export interface SeoKeyword {
  id: string;
  websiteProfileId: string;
  keyword: string;
  level: 'level_1' | 'level_2' | 'level_3';
  searchVolume?: number;
  currentRanking?: number;
  targetRanking?: number;
  targetPage?: string;
  difficultyScore?: number;
  assignedArticleId?: string;
  status: 'monitoring' | 'optimizing' | 'achieved' | 'paused';
  aiGenerated: boolean;
}

export interface EdmCampaign {
  id: string;
  websiteProfileId: string;
  campaignType: 'email' | 'sms';
  subject: string;
  templateName?: string;
  recipientType?: string;
  recipientCount?: number;
  sendDate?: string;
  status: 'draft' | 'scheduled' | 'sent' | 'cancelled';
  hoursSpent?: number;
  openRate?: number;
  clickRate?: number;
}

export interface CreditCard {
  id: string;
  companyName: string;
  lastFourDigits: string;
  expiryDate: string;
  bank: string;
  purpose: string;
  cardHolder: string;
  custodian: string;
  isActive: boolean;
  notes?: string;
}

export interface KPIStat {
  label: string;
  value: string;
  change: number;
  changeLabel: string;
}

export interface DayReport {
  id: string;
  date: string;
  project: string;
  tasks: string;
  hours: number;
  status: 'pending' | 'approved' | 'rejected';
  submittedBy: string;
}

export interface Quotation {
  id: string;
  quoteId: string;
  client: string;
  projectType: string;
  amount: number;
  status: 'draft' | 'sent' | 'approved' | 'rejected';
  createdDate: string;
}

export interface Supplier {
  id: string;
  name: string;
  category: string;
  contactPerson: string;
  email?: string;
  phone?: string;
  website?: string;
  contractStatus: 'active' | 'expired' | 'pending';
  serviceType?: string;
  feeRange?: string;
  averageRating: number;
  isRecommended: boolean;
  totalSpend: number;
  notes?: string;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  client: string;
  amount: number;
  dueDate: string;
  status: 'paid' | 'pending' | 'overdue' | 'partial';
}
