import { Dispatch, SetStateAction, useState } from 'react';
import {
  ArrowLeft, Calendar, DollarSign, User, Clock, Globe, FileText,
  Film, Megaphone, Plus, Edit, GanttChart, KanbanSquare, Target, Settings,
  Building2, Palette, TrendingUp, BarChart3, Users, X, Mail,
  Phone, ExternalLink, Tag, UserPlus, Pencil, Trash2, Link as LinkIcon
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ProjectTask, ProjectPriority } from '@/types/app';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useDataStore } from '@/context/DataStore';
import { useCompanyProjects } from '@/hooks/useCompanyProjects';
import { useClientProjects } from '@/hooks/useClientProjects';
import { useStaffNames } from '@/hooks/useStaffNames';
import { useProjectRoles } from '@/hooks/useProjectRoles';
import { useProjectDetails } from '@/hooks/useProjectDetails';

const statusConfig = {
  planning: { label: '規劃中', color: 'bg-blue-500', textColor: 'text-blue-700', bgColor: 'bg-blue-50' },
  active: { label: '進行中', color: 'bg-teal-600', textColor: 'text-teal-700', bgColor: 'bg-teal-50' },
  on_hold: { label: '暫停', color: 'bg-amber-500', textColor: 'text-amber-700', bgColor: 'bg-amber-50' },
  completed: { label: '已完成', color: 'bg-slate-500', textColor: 'text-slate-700', bgColor: 'bg-slate-50' },
  cancelled: { label: '已取消', color: 'bg-rose-500', textColor: 'text-rose-700', bgColor: 'bg-rose-50' },
};

const priorityConfig: Record<ProjectPriority, { label: string; color: string }> = {
  low: { label: '低', color: 'bg-green-100 text-green-700' },
  medium: { label: '中', color: 'bg-blue-100 text-blue-700' },
  high: { label: '高', color: 'bg-amber-100 text-amber-700' },
  urgent: { label: '緊急', color: 'bg-rose-100 text-rose-700' },
};

const projectTypeLabels: Record<string, string> = {
  web_design: '網站設計',
  system: '系統設計',
  graphic_design: '平面設計',
  event: '活動策劃',
  wine: '紅酒推廣',
  branding: '品牌設計',
  marketing: '行銷推廣',
  video: '影片製作',
  social_media: '社交媒體',
  edm: 'EDM 營銷',
  paid_ads: '付費廣告',
  seo_upgrade: 'SEO 升級',
  other: '其他',
};

const columnConfig = {
  todo: { label: '規劃中', color: 'border-slate-300', bgHeader: 'bg-slate-50' },
  in_progress: { label: '進行中', color: 'border-blue-400', bgHeader: 'bg-blue-50' },
  review: { label: '審核中', color: 'border-amber-400', bgHeader: 'bg-amber-50' },
  done: { label: '已完成', color: 'border-teal-400', bgHeader: 'bg-teal-50' },
};

type ColumnId = keyof typeof columnConfig;

// Team member types
interface TeamMember {
  id: string;
  name: string;
  avatarUrl?: string;
  roleInProject: string;
  estimatedHours: number;
}

// Client info type
interface ClientInfo {
  companyName: string;
  contactPerson: string;
  email: string;
  phone: string;
  companyPhone: string;
  website: string;
  tags: string[];
}

const emptyClientInfo: ClientInfo = {
  companyName: '',
  contactPerson: '',
  email: '',
  phone: '',
  companyPhone: '',
  website: '',
  tags: [],
};

const tagColors: Record<string, string> = {
  '知名品牌': 'bg-purple-100 text-purple-700',
  '大客戶': 'bg-teal-100 text-teal-700',
  '長期合作': 'bg-blue-100 text-blue-700',
  '成功案例': 'bg-amber-100 text-amber-700',
  '新客戶': 'bg-green-100 text-green-700',
};

export function ProjectDetail({ projectId, onBack }: { projectId?: string; onBack?: () => void }) {
  const { getProjectById } = useDataStore();
  const { projects: companyProjects } = useCompanyProjects();
  const { projects: clientProjects } = useClientProjects();
  const [activeTab, setActiveTab] = useState('overview');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newTask, setNewTask] = useState({ title: '', assignees: [] as string[], priority: 'medium' as ProjectPriority, startDate: '', endDate: '', estimatedHours: '', description: '' });
  const { teamMembers, setTeamMembers, tasks: persistedTasks, setTasks: setPersistedTasks } = useProjectDetails(projectId);
  const tasks = persistedTasks as unknown as ProjectTask[];
  const setTasks = setPersistedTasks as unknown as Dispatch<SetStateAction<ProjectTask[]>>;
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [newMember, setNewMember] = useState({ name: '', roleInProject: '', estimatedHours: '' });
  const [taskViewMode, setTaskViewMode] = useState<'kanban' | 'gantt'>('kanban');
  const [isAddingTask, setIsAddingTask] = useState(false);
  const { names: staffOptions } = useStaffNames();
  const { roles: roleOptions, addRole, removeRole } = useProjectRoles();
  const [isManageRolesOpen, setIsManageRolesOpen] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [roleToDelete, setRoleToDelete] = useState<string | null>(null);
  const [taskToDelete, setTaskToDelete] = useState<{ id: string; title: string } | null>(null);

  // Year Plan state
  const [yearPlan, setYearPlan] = useState<{
    year: number;
    targetRevenue: number;
    targetProjects: number;
    targetArticles: number;
    targetVideos: number;
    targetSocialPosts: number;
  } | null>(null);
  const [isYearPlanModalOpen, setIsYearPlanModalOpen] = useState(false);
  const [yearPlanForm, setYearPlanForm] = useState({
    targetRevenue: '',
    targetProjects: '',
    targetArticles: '',
    targetVideos: '',
    targetSocialPosts: '',
  });
  const [isSavingYearPlan, setIsSavingYearPlan] = useState(false);

  // Actual data for year plan comparison
  const actualData = {
    actualRevenue: 215000,
    actualProjects: 8,
    actualArticles: 22,
    actualVideos: 12,
    actualSocialPosts: 48,
  };

  const resolvedProject = projectId
    ? (companyProjects.find(p => p.id === projectId)
        || clientProjects.find(p => p.id === projectId)
        || getProjectById(projectId))
    : null;
  const project = resolvedProject;
  const completionPercent = tasks.length === 0
    ? 0
    : Math.round((tasks.filter(t => t.status === 'done').length / tasks.length) * 100);
  const budgetPercent = project && project.budgetTotal > 0 ? Math.round((project.budgetUsed / project.budgetTotal) * 100) : 0;
  const budgetAtRisk = budgetPercent >= 80;
  const config = project ? statusConfig[project.status] : statusConfig.planning;
  const totalEstimatedHours = tasks.reduce((s, t) => s + (t.estimatedHours || 0), 0);
  const totalActualHours = tasks.reduce((s, t) => s + (t.actualHours || 0), 0);
  const clientInfo: ClientInfo = emptyClientInfo;

  // Kanban columns
  const columns: Record<ColumnId, ProjectTask[]> = {
    todo: tasks.filter(t => t.status === 'todo'),
    in_progress: tasks.filter(t => t.status === 'in_progress'),
    review: tasks.filter(t => t.status === 'review'),
    done: tasks.filter(t => t.status === 'done'),
  };

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const { draggableId, destination } = result;
    const newStatus = destination.droppableId as ProjectTask['status'];
    setTasks(prev => prev.map(t => t.id === draggableId ? { ...t, status: newStatus } : t));
  };

  const handleAddTask = () => {
    if (!newTask.title) return;
    setIsAddingTask(true);
    setTimeout(() => {
      const task: ProjectTask = {
        id: `t${Date.now()}`,
        projectId: projectId || '1',
        title: newTask.title,
        assignee: newTask.assignees.join(', '),
        status: 'todo',
        priority: newTask.priority,
        startDate: newTask.startDate,
        endDate: newTask.endDate,
        estimatedHours: newTask.estimatedHours ? Number(newTask.estimatedHours) : undefined,
      };
      setTasks(prev => [...prev, task]);
      setNewTask({ title: '', assignees: [], priority: 'medium', startDate: '', endDate: '', estimatedHours: '', description: '' });
      setIsAddingTask(false);
      setIsAddOpen(false);
    }, 500);
  };

  const handleSaveYearPlan = () => {
    setIsSavingYearPlan(true);
    setTimeout(() => {
      setYearPlan({
        year: new Date().getFullYear(),
        targetRevenue: Number(yearPlanForm.targetRevenue) || 0,
        targetProjects: Number(yearPlanForm.targetProjects) || 0,
        targetArticles: Number(yearPlanForm.targetArticles) || 0,
        targetVideos: Number(yearPlanForm.targetVideos) || 0,
        targetSocialPosts: Number(yearPlanForm.targetSocialPosts) || 0,
      });
      setIsSavingYearPlan(false);
      setIsYearPlanModalOpen(false);
    }, 500);
  };

  const openYearPlanModal = () => {
    if (yearPlan) {
      setYearPlanForm({
        targetRevenue: String(yearPlan.targetRevenue),
        targetProjects: String(yearPlan.targetProjects),
        targetArticles: String(yearPlan.targetArticles),
        targetVideos: String(yearPlan.targetVideos),
        targetSocialPosts: String(yearPlan.targetSocialPosts),
      });
    } else {
      setYearPlanForm({ targetRevenue: '', targetProjects: '', targetArticles: '', targetVideos: '', targetSocialPosts: '' });
    }
    setIsYearPlanModalOpen(true);
  };

  const toggleAssignee = (name: string) => {
    setNewTask(prev => ({
      ...prev,
      assignees: prev.assignees.includes(name)
        ? prev.assignees.filter(n => n !== name)
        : [...prev.assignees, name]
    }));
  };

  // Gantt chart helpers
  const ganttTasks = tasks.filter(t => t.startDate && t.endDate);
  const ganttStartDate = ganttTasks.length > 0
    ? new Date(Math.min(...ganttTasks.map(t => new Date(t.startDate!).getTime())))
    : new Date();
  const ganttEndDate = ganttTasks.length > 0
    ? new Date(Math.max(...ganttTasks.map(t => new Date(t.endDate!).getTime())))
    : new Date();
  const ganttTotalDays = Math.max(Math.ceil((ganttEndDate.getTime() - ganttStartDate.getTime()) / (1000 * 60 * 60 * 24)), 1);

  const handleAddMember = () => {
    if (!newMember.name || !newMember.roleInProject) return;
    const member: TeamMember = {
      id: `m${Date.now()}`,
      name: newMember.name,
      roleInProject: newMember.roleInProject,
      estimatedHours: newMember.estimatedHours ? Number(newMember.estimatedHours) : 0,
    };
    setTeamMembers(prev => [...prev, member]);
    setNewMember({ name: '', roleInProject: '', estimatedHours: '' });
    setIsAddMemberOpen(false);
  };

  const handleRemoveMember = (memberId: string) => {
    setTeamMembers(prev => prev.filter(m => m.id !== memberId));
  };

  const totalTeamHours = teamMembers.reduce((s, m) => s + m.estimatedHours, 0);

  // ═══════════════════════════════════════════════
  // Related Content Modal States
  // ═══════════════════════════════════════════════
  interface WebsiteProfileEntry { id: string; name: string; domain: string; platform: string; devProgress: string; assignedStaff: string; manHours: number; outputUrl: string; notes: string; }
  interface ArticleEntry { id: string; title: string; channel: string; author: string; publishDate: string; seoKeywords: string; manHours: number; outputUrl: string; notes: string; }
  interface VideoEntry { id: string; title: string; videoChannel: string; status: string; shootDate: string; editor: string; manHours: number; outputUrl: string; notes: string; }
  interface SocialPostEntry { id: string; platform: string; content: string; scheduledDate: string; author: string; manHours: number; outputUrl: string; notes: string; }
  interface PaidAdEntry { id: string; campaignName: string; platform: string; budget: string; currency: string; startDate: string; endDate: string; manHours: number; outputUrl: string; notes: string; }

  const [websiteProfiles, setWebsiteProfiles] = useState<WebsiteProfileEntry[]>([]);
  const [articles, setArticles] = useState<ArticleEntry[]>([]);
  const [videos, setVideos] = useState<VideoEntry[]>([]);
  const [socialPosts, setSocialPosts] = useState<SocialPostEntry[]>([]);
  const [paidAds, setPaidAds] = useState<PaidAdEntry[]>([]);

  const [isWebsiteModalOpen, setIsWebsiteModalOpen] = useState(false);
  const [isArticleModalOpen, setIsArticleModalOpen] = useState(false);
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);
  const [isSocialModalOpen, setIsSocialModalOpen] = useState(false);
  const [isAdModalOpen, setIsAdModalOpen] = useState(false);

  const [newWebsite, setNewWebsite] = useState({ name: '', domain: '', platform: 'wordpress', devProgress: 'planning', assignedStaff: '', manHours: '', outputUrl: '', notes: '' });
  const [newArticle, setNewArticle] = useState({ title: '', channel: 'website_article', author: '', publishDate: '', seoKeywords: '', manHours: '', outputUrl: '', notes: '' });
  const [newVideo, setNewVideo] = useState({ title: '', videoChannel: '', status: 'planning', shootDate: '', editor: '', manHours: '', outputUrl: '', notes: '' });
  const [newSocial, setNewSocial] = useState({ platform: 'facebook', content: '', scheduledDate: '', author: '', manHours: '', outputUrl: '', notes: '' });
  const [newAd, setNewAd] = useState({ campaignName: '', platform: 'google_ads', budget: '', currency: 'HKD', startDate: '', endDate: '', manHours: '', outputUrl: '', notes: '' });

  const handleAddWebsite = () => {
    if (!newWebsite.name) return;
    setWebsiteProfiles(prev => [...prev, { id: `wp${Date.now()}`, name: newWebsite.name, domain: newWebsite.domain, platform: newWebsite.platform, devProgress: newWebsite.devProgress, assignedStaff: newWebsite.assignedStaff, manHours: Number(newWebsite.manHours) || 0, outputUrl: newWebsite.outputUrl, notes: newWebsite.notes }]);
    setNewWebsite({ name: '', domain: '', platform: 'wordpress', devProgress: 'planning', assignedStaff: '', manHours: '', outputUrl: '', notes: '' });
    setIsWebsiteModalOpen(false);
  };

  const handleAddArticle = () => {
    if (!newArticle.title) return;
    setArticles(prev => [...prev, { id: `art${Date.now()}`, title: newArticle.title, channel: newArticle.channel, author: newArticle.author, publishDate: newArticle.publishDate, seoKeywords: newArticle.seoKeywords, manHours: Number(newArticle.manHours) || 0, outputUrl: newArticle.outputUrl, notes: newArticle.notes }]);
    setNewArticle({ title: '', channel: 'website_article', author: '', publishDate: '', seoKeywords: '', manHours: '', outputUrl: '', notes: '' });
    setIsArticleModalOpen(false);
  };

  const handleAddVideo = () => {
    if (!newVideo.title) return;
    setVideos(prev => [...prev, { id: `vid${Date.now()}`, title: newVideo.title, videoChannel: newVideo.videoChannel, status: newVideo.status, shootDate: newVideo.shootDate, editor: newVideo.editor, manHours: Number(newVideo.manHours) || 0, outputUrl: newVideo.outputUrl, notes: newVideo.notes }]);
    setNewVideo({ title: '', videoChannel: '', status: 'planning', shootDate: '', editor: '', manHours: '', outputUrl: '', notes: '' });
    setIsVideoModalOpen(false);
  };

  const handleAddSocial = () => {
    if (!newSocial.content) return;
    setSocialPosts(prev => [...prev, { id: `sp${Date.now()}`, platform: newSocial.platform, content: newSocial.content, scheduledDate: newSocial.scheduledDate, author: newSocial.author, manHours: Number(newSocial.manHours) || 0, outputUrl: newSocial.outputUrl, notes: newSocial.notes }]);
    setNewSocial({ platform: 'facebook', content: '', scheduledDate: '', author: '', manHours: '', outputUrl: '', notes: '' });
    setIsSocialModalOpen(false);
  };

  const handleAddAd = () => {
    if (!newAd.campaignName) return;
    setPaidAds(prev => [...prev, { id: `ad${Date.now()}`, campaignName: newAd.campaignName, platform: newAd.platform, budget: newAd.budget, currency: newAd.currency, startDate: newAd.startDate, endDate: newAd.endDate, manHours: Number(newAd.manHours) || 0, outputUrl: newAd.outputUrl, notes: newAd.notes }]);
    setNewAd({ campaignName: '', platform: 'google_ads', budget: '', currency: 'HKD', startDate: '', endDate: '', manHours: '', outputUrl: '', notes: '' });
    setIsAdModalOpen(false);
  };

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-muted-foreground mb-4">找不到該項目</p>
        {onBack && (
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="w-4 h-4 mr-2" />返回列表
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {onBack && (
            <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5 text-muted-foreground hover:text-foreground">
              <ArrowLeft size={14} />
              返回項目列表
            </Button>
          )}
        </div>
      </div>

      {/* Project Header Card */}
      <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-[0_2px_6px_rgba(0,20,40,0.05)] p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-md bg-teal-600 flex items-center justify-center text-white font-bold text-[16px] flex-shrink-0">
              {project.brand?.substring(0, 2) || 'P'}
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-[22px] font-bold tracking-tight">{project.name}</h1>
                <Badge className={cn('text-[10px]', config.bgColor, config.textColor, 'hover:' + config.bgColor)}>
                  {config.label}
                </Badge>
                <Badge className={cn('text-[10px]', priorityConfig[project.priority].color)}>
                  {priorityConfig[project.priority].label}
                </Badge>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <Building2 size={12} className="text-muted-foreground" />
                  <span className="text-[12px] text-muted-foreground">{project.company}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Palette size={12} className="text-muted-foreground" />
                  <span className="text-[12px] text-muted-foreground">{project.brand}</span>
                </div>
                <span className="text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                  {projectTypeLabels[project.projectType]}
                </span>
                <span className={cn('text-[11px] px-1.5 py-0.5 rounded', project.projectCategory === 'client' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700')}>
                  {project.projectCategory === 'client' ? '客戶項目' : '內部發展'}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <span className="text-[11px] text-muted-foreground block">完成進度</span>
              <span className="text-[24px] font-bold text-teal-600">{completionPercent}%</span>
            </div>
            <div className="w-16 h-16">
              <svg viewBox="0 0 36 36" className="w-full h-full">
                <path
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke="#e5e7eb"
                  strokeWidth="3"
                />
                <path
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke="#0D9488"
                  strokeWidth="3"
                  strokeDasharray={`${completionPercent}, 100`}
                />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4 h-10">
          <TabsTrigger value="overview" className="text-[12px] gap-1.5">
            <BarChart3 size={14} />
            概覽
          </TabsTrigger>
          <TabsTrigger value="tasks" className="text-[12px] gap-1.5">
            <KanbanSquare size={14} />
            任務分配
          </TabsTrigger>
          <TabsTrigger value="content" className="text-[12px] gap-1.5">
            <FileText size={14} />
            關聯內容
          </TabsTrigger>
          <TabsTrigger value="year-plan" className="text-[12px] gap-1.5">
            <Target size={14} />
            年度計劃
          </TabsTrigger>
        </TabsList>

        {/* ═══════════════════════════════════════════════ */}
        {/* Tab 1: 概覽 (Overview) */}
        {/* ═══════════════════════════════════════════════ */}
        <TabsContent value="overview" className="mt-6 space-y-6">
          {/* Info Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-[0_2px_6px_rgba(0,20,40,0.05)] p-4">
              <div className="flex items-center gap-2 mb-2">
                <User size={14} className="text-teal-600" />
                <span className="text-[11px] font-medium text-muted-foreground">負責 PM</span>
              </div>
              <span className="text-[15px] font-bold">{project.assignedPm || '未分配'}</span>
            </div>
            <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-[0_2px_6px_rgba(0,20,40,0.05)] p-4">
              <div className="flex items-center gap-2 mb-2">
                <Calendar size={14} className="text-teal-600" />
                <span className="text-[11px] font-medium text-muted-foreground">時間範圍</span>
              </div>
              <span className="text-[13px] font-medium">{project.startDate}</span>
              <span className="text-[11px] text-muted-foreground"> → </span>
              <span className="text-[13px] font-medium">{project.endDate}</span>
            </div>
            <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-[0_2px_6px_rgba(0,20,40,0.05)] p-4">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign size={14} className="text-teal-600" />
                <span className="text-[11px] font-medium text-muted-foreground">預算使用</span>
              </div>
              <span className={cn('text-[15px] font-bold', budgetAtRisk ? 'text-amber-600' : '')}>
                ${(project.budgetUsed / 1000).toFixed(1)}K
              </span>
              <span className="text-[12px] text-muted-foreground"> / ${(project.budgetTotal / 1000).toFixed(1)}K</span>
            </div>
            <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-[0_2px_6px_rgba(0,20,40,0.05)] p-4">
              <div className="flex items-center gap-2 mb-2">
                <Clock size={14} className="text-teal-600" />
                <span className="text-[11px] font-medium text-muted-foreground">累計工時</span>
              </div>
              <span className="text-[15px] font-bold">{totalActualHours}h</span>
              <span className="text-[12px] text-muted-foreground"> / {totalEstimatedHours}h 預估</span>
            </div>
          </div>

          {/* Budget Progress Bar */}
          <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-[0_2px_6px_rgba(0,20,40,0.05)] p-5">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-[14px] font-bold">預算使用率</h4>
              <span className={cn('text-[13px] font-bold', budgetAtRisk ? 'text-amber-600' : 'text-teal-600')}>
                {budgetPercent}%
              </span>
            </div>
            <Progress value={budgetPercent} className="h-3" />
            <div className="flex justify-between text-[11px] text-muted-foreground mt-2">
              <span>已使用 ${project.budgetUsed.toLocaleString()}</span>
              <span>總預算 ${project.budgetTotal.toLocaleString()}</span>
            </div>
            {budgetAtRisk && (
              <p className="text-[12px] text-amber-600 font-medium mt-2">⚠ 預算使用已超過 80%，請注意控制支出。</p>
            )}
          </div>

          {/* Description & Details */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Description */}
            <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-[0_2px_6px_rgba(0,20,40,0.05)] p-5">
              <h4 className="text-[14px] font-bold mb-3">項目描述</h4>
              <p className="text-[13px] text-muted-foreground leading-relaxed">
                {project.description || '暫無描述。'}
              </p>
            </div>

            {/* Task Summary */}
            <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-[0_2px_6px_rgba(0,20,40,0.05)] p-5">
              <h4 className="text-[14px] font-bold mb-4">任務摘要</h4>
              <div className="grid grid-cols-4 gap-3">
                <div className="text-center p-3 bg-slate-50 rounded">
                  <span className="text-[18px] font-bold text-slate-600">{columns.todo.length}</span>
                  <span className="text-[11px] text-muted-foreground block mt-1">待辦</span>
                </div>
                <div className="text-center p-3 bg-blue-50 rounded">
                  <span className="text-[18px] font-bold text-blue-600">{columns.in_progress.length}</span>
                  <span className="text-[11px] text-muted-foreground block mt-1">進行中</span>
                </div>
                <div className="text-center p-3 bg-amber-50 rounded">
                  <span className="text-[18px] font-bold text-amber-600">{columns.review.length}</span>
                  <span className="text-[11px] text-muted-foreground block mt-1">審核中</span>
                </div>
                <div className="text-center p-3 bg-teal-50 rounded">
                  <span className="text-[18px] font-bold text-teal-600">{columns.done.length}</span>
                  <span className="text-[11px] text-muted-foreground block mt-1">已完成</span>
                </div>
              </div>
            </div>
          </div>

          {/* Company & Brand Info */}
          <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-[0_2px_6px_rgba(0,20,40,0.05)] p-5">
            <h4 className="text-[14px] font-bold mb-4">所屬公司 & 品牌</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded">
                <div className="w-10 h-10 rounded bg-teal-100 flex items-center justify-center">
                  <Building2 size={18} className="text-teal-700" />
                </div>
                <div>
                  <span className="text-[11px] text-muted-foreground block">公司</span>
                  <span className="text-[14px] font-bold">{project.company}</span>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded">
                <div className="w-10 h-10 rounded bg-purple-100 flex items-center justify-center">
                  <Palette size={18} className="text-purple-700" />
                </div>
                <div>
                  <span className="text-[11px] text-muted-foreground block">品牌</span>
                  <span className="text-[14px] font-bold">{project.brand}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Billing Model Section */}
          {project.projectCategory === 'client' && (
            <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-[0_2px_6px_rgba(0,20,40,0.05)] p-5">
              <div className="flex items-center gap-2 mb-4">
                <DollarSign size={16} className="text-teal-600" />
                <h4 className="text-[14px] font-bold">收費模式</h4>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-3 bg-slate-50 rounded">
                  <span className="text-[11px] text-muted-foreground block mb-1">收費類型</span>
                  <span className={cn('text-[13px] font-bold px-2 py-0.5 rounded inline-block', 
                    project.billingModel === 'recurring' ? 'bg-orange-50 text-orange-700' : 'bg-emerald-50 text-emerald-700'
                  )}>
                    {project.billingModel === 'recurring' ? '持續收費' : '一次性服務'}
                  </span>
                </div>
                {project.billingModel === 'recurring' && (
                  <>
                    <div className="p-3 bg-slate-50 rounded">
                      <span className="text-[11px] text-muted-foreground block mb-1">收費頻率</span>
                      <span className="text-[13px] font-bold">
                        {project.billingFrequency === 'monthly' ? '每月' : project.billingFrequency === 'quarterly' ? '每季（3個月）' : project.billingFrequency === 'semi_annual' ? '每半年' : '每年'}
                      </span>
                    </div>
                    <div className="p-3 bg-slate-50 rounded">
                      <span className="text-[11px] text-muted-foreground block mb-1">合約期限</span>
                      <span className="text-[13px] font-bold">
                        {project.contractDuration ? `${project.contractDuration} 個月` : '未設定'}
                      </span>
                      {project.contractStartDate && (
                        <span className="text-[11px] text-muted-foreground block mt-0.5">起始: {project.contractStartDate}</span>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════ */}
          {/* Service Items & Delivery Schedule */}
          {/* ═══════════════════════════════════════════════ */}
          {project.projectCategory === 'client' && project.serviceItems && project.serviceItems.length > 0 && (
            <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-[0_2px_6px_rgba(0,20,40,0.05)] p-5">
              <div className="flex items-center gap-2 mb-4">
                <FileText size={16} className="text-teal-600" />
                <h4 className="text-[14px] font-bold">服務項目及交付時間表</h4>
                <span className="text-[11px] bg-teal-50 text-teal-700 px-1.5 py-0.5 rounded font-medium">
                  {project.serviceItems.length} 項服務
                </span>
              </div>
              <div className="overflow-x-auto border border-border rounded-md">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-3 py-2.5">#</th>
                      <th className="text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-3 py-2.5">服務類型</th>
                      <th className="text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-3 py-2.5">數量</th>
                      <th className="text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-3 py-2.5">預計交付日期</th>
                      <th className="text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-3 py-2.5">備註</th>
                    </tr>
                  </thead>
                  <tbody>
                    {project.serviceItems.map((item, idx) => (
                      <tr key={item.id} className="border-b border-border/50">
                        <td className="px-3 py-2.5 text-[12px] text-muted-foreground">{idx + 1}</td>
                        <td className="px-3 py-2.5">
                          <span className="text-[11px] px-2 py-0.5 rounded bg-teal-50 text-teal-700 font-medium">
                            {projectTypeLabels[item.serviceType] || item.serviceType}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-[12px] font-medium">{item.quantity} {item.unit}</td>
                        <td className="px-3 py-2.5 text-[12px]">{item.deliveryDate || '待定'}</td>
                        <td className="px-3 py-2.5 text-[12px] text-muted-foreground">{item.notes || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between mt-3 text-[11px] text-muted-foreground">
                <span>合計數量：{project.serviceItems.reduce((sum, item) => sum + item.quantity, 0)}</span>
                {(() => {
                  const dates = project.serviceItems.filter(si => si.deliveryDate).map(si => si.deliveryDate);
                  if (dates.length === 0) return null;
                  const latest = dates.sort((a, b) => b.localeCompare(a))[0];
                  return <span>最後交付日期：<span className="font-medium text-[#0d1a2d]">{latest}</span></span>;
                })()}
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════ */}
          {/* Team Members Section */}
          {/* ═══════════════════════════════════════════════ */}
          <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-[0_2px_6px_rgba(0,20,40,0.05)] p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Users size={16} className="text-teal-600" />
                <h4 className="text-[14px] font-bold">團隊成員</h4>
                <span className="text-[11px] bg-teal-50 text-teal-700 px-1.5 py-0.5 rounded font-medium">
                  {teamMembers.length} 人
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[11px] text-muted-foreground">
                  總預計工時: <span className="font-bold text-foreground">{totalTeamHours}h</span>
                </span>
                <Dialog open={isAddMemberOpen} onOpenChange={setIsAddMemberOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline" className="gap-1.5 text-[12px]">
                      <UserPlus size={13} />
                      新增成員
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[400px]">
                    <DialogHeader>
                      <DialogTitle>新增團隊成員</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 mt-4">
                      <div className="space-y-2">
                        <Label className="text-[13px]">選擇同事 *</Label>
                        <Select value={newMember.name} onValueChange={(val) => setNewMember({ ...newMember, name: val })}>
                          <SelectTrigger className="text-[13px]">
                            <SelectValue placeholder="選擇同事" />
                          </SelectTrigger>
                          <SelectContent>
                            {staffOptions.filter(s => !teamMembers.find(m => m.name === s)).map(staff => (
                              <SelectItem key={staff} value={staff}>{staff}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-[13px]">項目中的角色 *</Label>
                          <button
                            type="button"
                            onClick={() => setIsManageRolesOpen(true)}
                            className="inline-flex items-center gap-1 text-[11px] text-teal-600 hover:text-teal-700"
                          >
                            <Settings size={12} />
                            管理角色
                          </button>
                        </div>
                        <Select value={newMember.roleInProject} onValueChange={(val) => setNewMember({ ...newMember, roleInProject: val })}>
                          <SelectTrigger className="text-[13px]">
                            <SelectValue placeholder="選擇角色" />
                          </SelectTrigger>
                          <SelectContent>
                            {roleOptions.map(role => (
                              <SelectItem key={role} value={role}>{role}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[13px]">預計投入工時 (h)</Label>
                        <Input
                          type="number"
                          value={newMember.estimatedHours}
                          onChange={(e) => setNewMember({ ...newMember, estimatedHours: e.target.value })}
                          placeholder="40"
                          className="text-[13px]"
                        />
                      </div>
                      <div className="flex justify-end gap-2 pt-2">
                        <Button variant="outline" size="sm" onClick={() => setIsAddMemberOpen(false)}>取消</Button>
                        <Button size="sm" className="bg-teal-600 hover:bg-teal-700" onClick={handleAddMember} disabled={!newMember.name || !newMember.roleInProject}>新增</Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>

                {/* Manage Roles Dialog */}
                <Dialog open={isManageRolesOpen} onOpenChange={setIsManageRolesOpen}>
                  <DialogContent className="sm:max-w-[420px]">
                    <DialogHeader>
                      <DialogTitle>管理角色</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 mt-4">
                      <div className="space-y-2">
                        <Label className="text-[13px]">新增角色</Label>
                        <div className="flex items-center gap-2">
                          <Input
                            value={newRoleName}
                            onChange={(e) => setNewRoleName(e.target.value)}
                            placeholder="輸入角色名稱"
                            className="text-[13px]"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && newRoleName.trim()) {
                                addRole(newRoleName);
                                setNewRoleName('');
                              }
                            }}
                          />
                          <Button
                            size="sm"
                            className="bg-teal-600 hover:bg-teal-700"
                            disabled={!newRoleName.trim() || roleOptions.includes(newRoleName.trim())}
                            onClick={() => { addRole(newRoleName); setNewRoleName(''); }}
                          >
                            <Plus size={13} />
                          </Button>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[13px]">目前角色</Label>
                        {roleOptions.length === 0 ? (
                          <div className="text-[12px] text-muted-foreground py-2">尚未有任何角色</div>
                        ) : (
                          <div className="border rounded-md divide-y">
                            {roleOptions.map(role => (
                              <div key={role} className="flex items-center justify-between px-3 py-2">
                                <span className="text-[13px]">{role}</span>
                                <button
                                  type="button"
                                  onClick={() => setRoleToDelete(role)}
                                  className="inline-flex items-center gap-1 text-[12px] text-rose-600 hover:text-rose-700"
                                >
                                  <Trash2 size={12} />
                                  刪除
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex justify-end pt-2">
                        <Button variant="outline" size="sm" onClick={() => setIsManageRolesOpen(false)}>關閉</Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>

                {/* Confirm Delete Role Dialog */}
                <Dialog open={!!roleToDelete} onOpenChange={(open) => !open && setRoleToDelete(null)}>
                  <DialogContent className="sm:max-w-[360px]">
                    <DialogHeader>
                      <DialogTitle>確認刪除角色</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 mt-2">
                      <div className="text-[13px] text-muted-foreground">
                        是否刪除「{roleToDelete}」的角色？
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => setRoleToDelete(null)}>取消</Button>
                        <Button
                          size="sm"
                          className="bg-rose-600 hover:bg-rose-700 text-white"
                          onClick={() => {
                            if (roleToDelete) removeRole(roleToDelete);
                            setRoleToDelete(null);
                          }}
                        >
                          確認刪除
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            {/* Team members grid */}
            {teamMembers.length === 0 ? (
              <div className="text-center py-8 text-[13px] text-muted-foreground">暫無團隊成員</div>
            ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {teamMembers.map(member => (
                <div key={member.id} className="relative group p-3 rounded-md border border-border/60 hover:border-teal-200 hover:shadow-sm transition-all">
                  <button
                    onClick={() => handleRemoveMember(member.id)}
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-rose-50"
                    title="移除成員"
                  >
                    <X size={12} className="text-rose-500" />
                  </button>
                  <div className="flex items-center gap-2.5 mb-2">
                    <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center text-[12px] font-bold text-teal-700 flex-shrink-0">
                      {member.name.substring(0, 1)}
                    </div>
                    <div className="min-w-0">
                      <span className="text-[13px] font-medium block truncate">{member.name}</span>
                      <span className="text-[11px] text-muted-foreground">{member.roleInProject}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-border/40">
                    <Clock size={11} className="text-muted-foreground" />
                    <span className="text-[11px] text-muted-foreground">預計 <span className="font-medium text-foreground">{member.estimatedHours}h</span></span>
                  </div>
                </div>
              ))}
            </div>
            )}
          </div>

          {/* ═══════════════════════════════════════════════ */}
          {/* Client Info Section (only for client projects) */}
          {/* ═══════════════════════════════════════════════ */}
          {project.projectCategory === 'client' && (
            <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-[0_2px_6px_rgba(0,20,40,0.05)] p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <User size={16} className="text-teal-600" />
                  <h4 className="text-[14px] font-bold">客戶資料</h4>
                </div>
                <Button size="sm" variant="outline" className="gap-1.5 text-[12px]">
                  <Pencil size={12} />
                  編輯客戶資料
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Client details */}
                <div className="space-y-3">
                  <div className="flex items-start gap-3 p-3 bg-slate-50 rounded">
                    <Building2 size={14} className="text-muted-foreground mt-0.5 flex-shrink-0" />
                    <div>
                      <span className="text-[11px] text-muted-foreground block">客戶公司</span>
                      <span className="text-[13px] font-medium">{clientInfo.companyName || '—'}</span>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 bg-slate-50 rounded">
                    <User size={14} className="text-muted-foreground mt-0.5 flex-shrink-0" />
                    <div>
                      <span className="text-[11px] text-muted-foreground block">聯絡人</span>
                      <span className="text-[13px] font-medium">{clientInfo.contactPerson || '—'}</span>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 bg-slate-50 rounded">
                    <Mail size={14} className="text-muted-foreground mt-0.5 flex-shrink-0" />
                    <div>
                      <span className="text-[11px] text-muted-foreground block">電郵</span>
                      {clientInfo.email ? (
                        <a href={`mailto:${clientInfo.email}`} className="text-[13px] font-medium text-teal-600 hover:underline">
                          {clientInfo.email}
                        </a>
                      ) : (
                        <span className="text-[13px] font-medium">—</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-start gap-3 p-3 bg-slate-50 rounded">
                    <Phone size={14} className="text-muted-foreground mt-0.5 flex-shrink-0" />
                    <div>
                      <span className="text-[11px] text-muted-foreground block">主要聯絡電話</span>
                      <span className="text-[13px] font-medium">{clientInfo.phone || '—'}</span>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 bg-slate-50 rounded">
                    <Phone size={14} className="text-muted-foreground mt-0.5 flex-shrink-0" />
                    <div>
                      <span className="text-[11px] text-muted-foreground block">公司電話</span>
                      <span className="text-[13px] font-medium">{clientInfo.companyPhone || '—'}</span>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 bg-slate-50 rounded">
                    <ExternalLink size={14} className="text-muted-foreground mt-0.5 flex-shrink-0" />
                    <div>
                      <span className="text-[11px] text-muted-foreground block">公司網頁</span>
                      {clientInfo.website ? (
                        <a href={clientInfo.website} target="_blank" rel="noopener noreferrer" className="text-[13px] font-medium text-teal-600 hover:underline">
                          {clientInfo.website}
                        </a>
                      ) : (
                        <span className="text-[13px] font-medium">—</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Tags */}
              {clientInfo.tags.length > 0 && (
                <div className="mt-4 pt-4 border-t border-border/40">
                  <div className="flex items-center gap-2 mb-2">
                    <Tag size={12} className="text-muted-foreground" />
                    <span className="text-[11px] text-muted-foreground">標籤</span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {clientInfo.tags.map(tag => (
                      <Badge key={tag} className={cn('text-[11px] font-medium', tagColors[tag] || 'bg-slate-100 text-slate-700')}>
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </TabsContent>

        {/* ═══════════════════════════════════════════════ */}
        {/* Tab 2: 任務分配 (Tasks - Kanban + Gantt) */}
        {/* ═══════════════════════════════════════════════ */}
        <TabsContent value="tasks" className="mt-6 space-y-4">
          {/* Top bar with view toggle */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center bg-muted/50 rounded-md p-0.5">
                <button
                  onClick={() => setTaskViewMode('kanban')}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded text-[12px] font-medium transition-all',
                    taskViewMode === 'kanban' ? 'bg-white shadow-sm text-teal-700' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <KanbanSquare size={14} />
                  看板模式
                </button>
                <button
                  onClick={() => setTaskViewMode('gantt')}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded text-[12px] font-medium transition-all',
                    taskViewMode === 'gantt' ? 'bg-white shadow-sm text-teal-700' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <GanttChart size={14} />
                  甘特圖
                </button>
              </div>
              {taskViewMode === 'kanban' && (
                <span className="text-[12px] text-muted-foreground">（拖拉卡片即可更新狀態）</span>
              )}
            </div>
            <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="bg-teal-600 hover:bg-teal-700 text-white gap-1.5">
                  <Plus size={14} />
                  新增任務
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                  <DialogTitle>新增任務</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-4">
                  {/* Project context */}
                  <div className="bg-slate-50 rounded-md p-3 text-[12px] text-muted-foreground space-y-0.5">
                    <p>所屬公司：<span className="text-foreground font-medium">{project.company}</span></p>
                    <p>所屬品牌：<span className="text-foreground font-medium">{project.brand}</span></p>
                    <p>所屬項目：<span className="text-foreground font-medium">{project.name}</span></p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[13px]">任務名稱 *</Label>
                    <Input
                      value={newTask.title}
                      onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                      placeholder="輸入任務名稱"
                      className="text-[13px]"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[13px]">負責同事（可多選）</Label>
                    <div className="flex flex-wrap gap-2 p-2 border rounded-md min-h-[40px]">
                      {teamMembers.length === 0 ? (
                        <span className="text-[11px] text-muted-foreground py-1">請先在「概覽 → 團隊成員」新增成員</span>
                      ) : teamMembers.map(m => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => toggleAssignee(m.name)}
                          className={cn(
                            'text-[11px] px-2 py-1 rounded-md border transition-all',
                            newTask.assignees.includes(m.name)
                              ? 'bg-teal-600 text-white border-teal-600'
                              : 'bg-white text-muted-foreground border-border hover:border-teal-300'
                          )}
                        >
                          {m.name}
                        </button>
                      ))}
                    </div>
                    {newTask.assignees.length > 0 && (
                      <p className="text-[11px] text-teal-600">已選：{newTask.assignees.join(', ')}</p>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-[13px]">優先級</Label>
                      <Select value={newTask.priority} onValueChange={(val) => setNewTask({ ...newTask, priority: val as ProjectPriority })}>
                        <SelectTrigger className="text-[13px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(priorityConfig).map(([key, cfg]) => (
                            <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[13px]">預估工時 (h)</Label>
                      <Input type="number" value={newTask.estimatedHours} onChange={(e) => setNewTask({ ...newTask, estimatedHours: e.target.value })} placeholder="8" className="text-[13px]" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-[13px]">開始日期</Label>
                      <Input type="date" value={newTask.startDate} onChange={(e) => setNewTask({ ...newTask, startDate: e.target.value })} className="text-[13px]" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[13px]">到期日</Label>
                      <Input type="date" value={newTask.endDate} onChange={(e) => setNewTask({ ...newTask, endDate: e.target.value })} className="text-[13px]" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[13px]">任務描述</Label>
                    <Textarea
                      value={newTask.description}
                      onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                      placeholder="描述任務內容、交付物..."
                      className="text-[13px] min-h-[80px]"
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" size="sm" onClick={() => setIsAddOpen(false)}>取消</Button>
                    <Button size="sm" className="bg-teal-600 hover:bg-teal-700" onClick={handleAddTask} disabled={!newTask.title || isAddingTask}>
                      {isAddingTask ? (
                        <span className="flex items-center gap-1.5">
                          <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          新增中...
                        </span>
                      ) : '確認新增'}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {/* Kanban Board */}
          {taskViewMode === 'kanban' && (
            <DragDropContext onDragEnd={handleDragEnd}>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {(Object.entries(columnConfig) as [ColumnId, typeof columnConfig[ColumnId]][]).map(([colId, col]) => (
                  <Droppable key={colId} droppableId={colId}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={cn(
                          'rounded-md p-3 border-t-2 min-h-[350px] transition-colors',
                          col.color,
                          snapshot.isDraggingOver ? 'bg-muted/40' : 'bg-muted/20'
                        )}
                      >
                        <div className={cn('flex items-center justify-between mb-3 px-2 py-1.5 rounded', col.bgHeader)}>
                          <span className="text-[13px] font-bold">{col.label}</span>
                          <span className="text-[11px] bg-white px-1.5 py-0.5 rounded shadow-sm font-medium">
                            {columns[colId].length}
                          </span>
                        </div>
                        <div className="space-y-2">
                          {columns[colId].map((task, index) => (
                            <Draggable key={task.id} draggableId={task.id} index={index}>
                              {(provided, snapshot) => (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  {...provided.dragHandleProps}
                                  className={cn(
                                    'bg-white rounded border border-border/50 p-3 transition-shadow',
                                    snapshot.isDragging ? 'shadow-lg ring-2 ring-teal-200' : 'hover:shadow-md cursor-grab'
                                  )}
                                >
                                  <div className="flex items-start justify-between gap-2 mb-2">
                                    <span className="text-[13px] font-medium flex-1">{task.title}</span>
                                    <button
                                      type="button"
                                      onMouseDown={(e) => e.stopPropagation()}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setTaskToDelete({ id: task.id, title: task.title });
                                      }}
                                      className="text-muted-foreground hover:text-rose-600 -mt-0.5 -mr-0.5 p-0.5"
                                      aria-label="刪除任務"
                                    >
                                      <X size={14} />
                                    </button>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-1">
                                      <Users size={10} className="text-muted-foreground" />
                                      <span className="text-[11px] text-muted-foreground">{task.assignee}</span>
                                    </div>
                                    <span className={cn('text-[9px] font-medium px-1 py-0.5 rounded', priorityConfig[task.priority].color)}>
                                      {priorityConfig[task.priority].label}
                                    </span>
                                  </div>
                                  {task.endDate && (
                                    <div className="flex items-center gap-1 mt-1.5">
                                      <Calendar size={10} className="text-muted-foreground" />
                                      <span className="text-[10px] text-muted-foreground">
                                        截止: {task.endDate}
                                      </span>
                                    </div>
                                  )}
                                  {task.estimatedHours && (
                                    <div className="flex items-center gap-1 mt-1.5">
                                      <Clock size={10} className="text-muted-foreground" />
                                      <span className="text-[10px] text-muted-foreground">
                                        {task.actualHours || 0}h / {task.estimatedHours}h
                                      </span>
                                      <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
                                        <div
                                          className="h-full bg-teal-500 rounded-full"
                                          style={{ width: `${Math.min(((task.actualHours || 0) / task.estimatedHours) * 100, 100)}%` }}
                                        />
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                        </div>
                      </div>
                    )}
                  </Droppable>
                ))}
              </div>
            </DragDropContext>
          )}

          {/* Confirm Delete Task Dialog */}
          <Dialog open={!!taskToDelete} onOpenChange={(open) => !open && setTaskToDelete(null)}>
            <DialogContent className="sm:max-w-[360px]">
              <DialogHeader>
                <DialogTitle>確認刪除任務</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <div className="text-[13px] text-muted-foreground">
                  是否刪除「{taskToDelete?.title}」這個任務？
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => setTaskToDelete(null)}>否</Button>
                  <Button
                    size="sm"
                    className="bg-rose-600 hover:bg-rose-700 text-white"
                    onClick={() => {
                      if (taskToDelete) {
                        setTasks(prev => prev.filter(t => t.id !== taskToDelete.id));
                      }
                      setTaskToDelete(null);
                    }}
                  >
                    是
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Gantt Chart View */}
          {taskViewMode === 'gantt' && (
            <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-[0_2px_6px_rgba(0,20,40,0.05)] p-5 overflow-x-auto">
              <div className="min-w-[700px]">
                {/* Gantt header - month markers */}
                <div className="flex items-center mb-4 border-b border-border/50 pb-2">
                  <div className="w-[200px] flex-shrink-0 text-[11px] font-medium text-muted-foreground">任務名稱</div>
                  <div className="flex-1 relative h-6">
                    {(() => {
                      const months: string[] = [];
                      const startMonth = new Date(ganttStartDate);
                      startMonth.setDate(1);
                      while (startMonth <= ganttEndDate) {
                        months.push(`${startMonth.getFullYear()}-${String(startMonth.getMonth() + 1).padStart(2, '0')}`);
                        startMonth.setMonth(startMonth.getMonth() + 1);
                      }
                      return months.map((m, i) => (
                        <span key={m} className="text-[10px] text-muted-foreground absolute" style={{ left: `${(i / Math.max(months.length, 1)) * 100}%` }}>
                          {m}
                        </span>
                      ));
                    })()}
                  </div>
                </div>
                {/* Gantt rows */}
                <div className="space-y-2">
                  {ganttTasks.map(task => {
                    const taskStart = new Date(task.startDate!);
                    const taskEnd = new Date(task.endDate!);
                    const offsetDays = Math.ceil((taskStart.getTime() - ganttStartDate.getTime()) / (1000 * 60 * 60 * 24));
                    const durationDays = Math.ceil((taskEnd.getTime() - taskStart.getTime()) / (1000 * 60 * 60 * 24));
                    const leftPercent = (offsetDays / ganttTotalDays) * 100;
                    const widthPercent = Math.max((durationDays / ganttTotalDays) * 100, 2);
                    const priorityBarColor = task.priority === 'urgent' ? 'bg-rose-500' : task.priority === 'high' ? 'bg-amber-500' : task.priority === 'medium' ? 'bg-blue-500' : 'bg-green-500';
                    const statusBarOpacity = task.status === 'done' ? 'opacity-60' : 'opacity-100';

                    return (
                      <div key={task.id} className="flex items-center group hover:bg-muted/20 rounded px-1 py-1.5 transition-colors">
                        <div className="w-[200px] flex-shrink-0 flex items-center gap-2">
                          <span className={cn('w-2 h-2 rounded-full flex-shrink-0', priorityBarColor)} />
                          <span className="text-[12px] font-medium truncate">{task.title}</span>
                        </div>
                        <div className="flex-1 relative h-7">
                          <div className="absolute inset-0 bg-muted/20 rounded" />
                          <div
                            className={cn('absolute h-5 top-1 rounded-sm flex items-center px-2 transition-all cursor-grab', priorityBarColor, statusBarOpacity)}
                            style={{ left: `${leftPercent}%`, width: `${widthPercent}%` }}
                            title={`${task.startDate} → ${task.endDate}`}
                          >
                            <span className="text-[9px] text-white font-medium truncate">
                              {task.assignee}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {ganttTasks.length === 0 && (
                    <div className="text-center py-10 text-[13px] text-muted-foreground">
                      暫無設定開始/結束日期的任務
                    </div>
                  )}
                </div>
                {/* Legend */}
                <div className="flex items-center gap-4 mt-6 pt-4 border-t border-border/30">
                  <span className="text-[11px] text-muted-foreground">優先級：</span>
                  {Object.entries(priorityConfig).map(([key, cfg]) => (
                    <div key={key} className="flex items-center gap-1">
                      <span className={cn('w-2.5 h-2.5 rounded-full', key === 'urgent' ? 'bg-rose-500' : key === 'high' ? 'bg-amber-500' : key === 'medium' ? 'bg-blue-500' : 'bg-green-500')} />
                      <span className="text-[10px] text-muted-foreground">{cfg.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ═══════════════════════════════════════════════ */}
        {/* Tab 3: 關聯內容 (Related Content) */}
        {/* ═══════════════════════════════════════════════ */}
        <TabsContent value="content" className="mt-6">
          <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-[0_2px_6px_rgba(0,20,40,0.05)] p-8">
            <div className="space-y-6">
              <div className="text-center">
                <h3 className="text-[16px] font-bold mb-2">關聯內容管理</h3>
                <p className="text-[13px] text-muted-foreground">管理與此項目相關的所有內容，包括網站、文章、影片、社交帖文及廣告。</p>
                {project.projectCategory === 'client' && (
                  <p className="text-[12px] text-teal-700 mt-1">客戶：{project.clientName}</p>
                )}
              </div>

              {/* Content counts grid */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 max-w-[700px] mx-auto">
                <div className="flex flex-col items-center p-4 rounded-md border border-dashed border-border hover:border-teal-300 cursor-pointer transition-colors group" onClick={() => setIsWebsiteModalOpen(true)}>
                  <Globe size={24} className="text-muted-foreground group-hover:text-teal-600 mb-2 transition-colors" />
                  <span className="text-[11px] text-muted-foreground">網站 Profile</span>
                  <span className="text-[16px] font-bold mt-1">{websiteProfiles.length}</span>
                </div>
                <div className="flex flex-col items-center p-4 rounded-md border border-dashed border-border hover:border-teal-300 cursor-pointer transition-colors group" onClick={() => setIsArticleModalOpen(true)}>
                  <FileText size={24} className="text-muted-foreground group-hover:text-teal-600 mb-2 transition-colors" />
                  <span className="text-[11px] text-muted-foreground">文章</span>
                  <span className="text-[16px] font-bold mt-1">{articles.length}</span>
                </div>
                <div className="flex flex-col items-center p-4 rounded-md border border-dashed border-border hover:border-teal-300 cursor-pointer transition-colors group" onClick={() => setIsVideoModalOpen(true)}>
                  <Film size={24} className="text-muted-foreground group-hover:text-teal-600 mb-2 transition-colors" />
                  <span className="text-[11px] text-muted-foreground">影片</span>
                  <span className="text-[16px] font-bold mt-1">{videos.length}</span>
                </div>
                <div className="flex flex-col items-center p-4 rounded-md border border-dashed border-border hover:border-teal-300 cursor-pointer transition-colors group" onClick={() => setIsSocialModalOpen(true)}>
                  <Megaphone size={24} className="text-muted-foreground group-hover:text-teal-600 mb-2 transition-colors" />
                  <span className="text-[11px] text-muted-foreground">社交帖文</span>
                  <span className="text-[16px] font-bold mt-1">{socialPosts.length}</span>
                </div>
                <div className="flex flex-col items-center p-4 rounded-md border border-dashed border-border hover:border-teal-300 cursor-pointer transition-colors group" onClick={() => setIsAdModalOpen(true)}>
                  <TrendingUp size={24} className="text-muted-foreground group-hover:text-teal-600 mb-2 transition-colors" />
                  <span className="text-[11px] text-muted-foreground">付費廣告</span>
                  <span className="text-[16px] font-bold mt-1">{paidAds.length}</span>
                </div>
              </div>

              {/* List of existing content */}
              {(websiteProfiles.length > 0 || articles.length > 0 || videos.length > 0 || socialPosts.length > 0 || paidAds.length > 0) && (
                <div className="space-y-4 text-left max-w-[800px] mx-auto">
                  {websiteProfiles.length > 0 && (
                    <div>
                      <h4 className="text-[13px] font-semibold mb-2 flex items-center gap-1.5"><Globe size={13} className="text-teal-600" /> 網站 Profile ({websiteProfiles.length})</h4>
                      <div className="space-y-1.5">
                        {websiteProfiles.map(wp => (
                          <div key={wp.id} className="flex items-center justify-between p-2.5 rounded border border-border/50 bg-slate-50/50 text-[12px]">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{wp.name}</span>
                              {wp.domain && <span className="text-muted-foreground">({wp.domain})</span>}
                              <Badge variant="outline" className="text-[10px] py-0">{wp.platform}</Badge>
                            </div>
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <span><Clock size={11} className="inline mr-0.5" />{wp.manHours}h</span>
                              {wp.outputUrl && <a href={wp.outputUrl} target="_blank" rel="noopener noreferrer" className="text-teal-600 hover:underline"><LinkIcon size={11} /></a>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {articles.length > 0 && (
                    <div>
                      <h4 className="text-[13px] font-semibold mb-2 flex items-center gap-1.5"><FileText size={13} className="text-teal-600" /> 文章 ({articles.length})</h4>
                      <div className="space-y-1.5">
                        {articles.map(a => (
                          <div key={a.id} className="flex items-center justify-between p-2.5 rounded border border-border/50 bg-slate-50/50 text-[12px]">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{a.title}</span>
                              <Badge variant="outline" className="text-[10px] py-0">{a.channel}</Badge>
                            </div>
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <span><Clock size={11} className="inline mr-0.5" />{a.manHours}h</span>
                              {a.outputUrl && <a href={a.outputUrl} target="_blank" rel="noopener noreferrer" className="text-teal-600 hover:underline"><LinkIcon size={11} /></a>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {videos.length > 0 && (
                    <div>
                      <h4 className="text-[13px] font-semibold mb-2 flex items-center gap-1.5"><Film size={13} className="text-teal-600" /> 影片 ({videos.length})</h4>
                      <div className="space-y-1.5">
                        {videos.map(v => (
                          <div key={v.id} className="flex items-center justify-between p-2.5 rounded border border-border/50 bg-slate-50/50 text-[12px]">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{v.title}</span>
                              <Badge variant="outline" className="text-[10px] py-0">{v.status}</Badge>
                            </div>
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <span><Clock size={11} className="inline mr-0.5" />{v.manHours}h</span>
                              {v.outputUrl && <a href={v.outputUrl} target="_blank" rel="noopener noreferrer" className="text-teal-600 hover:underline"><LinkIcon size={11} /></a>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {socialPosts.length > 0 && (
                    <div>
                      <h4 className="text-[13px] font-semibold mb-2 flex items-center gap-1.5"><Megaphone size={13} className="text-teal-600" /> 社交帖文 ({socialPosts.length})</h4>
                      <div className="space-y-1.5">
                        {socialPosts.map(sp => (
                          <div key={sp.id} className="flex items-center justify-between p-2.5 rounded border border-border/50 bg-slate-50/50 text-[12px]">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{sp.content.slice(0, 40)}{sp.content.length > 40 ? '...' : ''}</span>
                              <Badge variant="outline" className="text-[10px] py-0">{sp.platform}</Badge>
                            </div>
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <span><Clock size={11} className="inline mr-0.5" />{sp.manHours}h</span>
                              {sp.outputUrl && <a href={sp.outputUrl} target="_blank" rel="noopener noreferrer" className="text-teal-600 hover:underline"><LinkIcon size={11} /></a>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {paidAds.length > 0 && (
                    <div>
                      <h4 className="text-[13px] font-semibold mb-2 flex items-center gap-1.5"><TrendingUp size={13} className="text-teal-600" /> 付費廣告 ({paidAds.length})</h4>
                      <div className="space-y-1.5">
                        {paidAds.map(ad => (
                          <div key={ad.id} className="flex items-center justify-between p-2.5 rounded border border-border/50 bg-slate-50/50 text-[12px]">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{ad.campaignName}</span>
                              <Badge variant="outline" className="text-[10px] py-0">{ad.platform}</Badge>
                              <span className="text-muted-foreground">{ad.currency} {ad.budget}</span>
                            </div>
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <span><Clock size={11} className="inline mr-0.5" />{ad.manHours}h</span>
                              {ad.outputUrl && <a href={ad.outputUrl} target="_blank" rel="noopener noreferrer" className="text-teal-600 hover:underline"><LinkIcon size={11} /></a>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {(websiteProfiles.length === 0 && articles.length === 0 && videos.length === 0 && socialPosts.length === 0 && paidAds.length === 0) && (
                <p className="text-[13px] text-muted-foreground text-center">目前尚無關聯內容，點擊下方按鈕開始新增。</p>
              )}

              {/* Quick action buttons */}
              <div className="flex items-center justify-center gap-3 flex-wrap">
                <Button size="sm" className="bg-teal-600 hover:bg-teal-700 text-white gap-1.5" onClick={() => setIsWebsiteModalOpen(true)}>
                  <Globe size={13} />
                  新增網站 Profile
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setIsArticleModalOpen(true)}>
                  <FileText size={13} />
                  新增文章
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setIsVideoModalOpen(true)}>
                  <Film size={13} />
                  新增影片
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setIsSocialModalOpen(true)}>
                  <Megaphone size={13} />
                  新增社交帖文
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setIsAdModalOpen(true)}>
                  <TrendingUp size={13} />
                  新增付費廣告
                </Button>
              </div>
            </div>
          </div>

          {/* ═══ Modal: 新增網站 Profile ═══ */}
          <Dialog open={isWebsiteModalOpen} onOpenChange={setIsWebsiteModalOpen}>
            <DialogContent className="sm:max-w-[520px]">
              <DialogHeader>
                <DialogTitle className="text-[15px]">新增網站 Profile</DialogTitle>
              </DialogHeader>
              <div className="space-y-1 mb-3">
                <div className="flex items-center gap-4 text-[11px] text-muted-foreground bg-slate-50 rounded p-2">
                  <span><Building2 size={11} className="inline mr-1" />公司：{project.company}</span>
                  <span><Palette size={11} className="inline mr-1" />品牌：{project.brand}</span>
                  <span><Target size={11} className="inline mr-1" />項目：{project.name}</span>
                </div>
                {project.projectCategory === 'client' && (
                  <div className="text-[11px] text-teal-700 bg-teal-50 rounded p-1.5 px-2"><User size={11} className="inline mr-1" />客戶：{project.clientName}</div>
                )}
              </div>
              <div className="grid gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-[12px]">網站名稱 *</Label><Input placeholder="例：BW 官網" value={newWebsite.name} onChange={e => setNewWebsite(p => ({...p, name: e.target.value}))} className="text-[12px] mt-1" /></div>
                  <div><Label className="text-[12px]">Domain URL</Label><Input placeholder="https://" value={newWebsite.domain} onChange={e => setNewWebsite(p => ({...p, domain: e.target.value}))} className="text-[12px] mt-1" /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-[12px]">平台</Label><Select value={newWebsite.platform} onValueChange={v => setNewWebsite(p => ({...p, platform: v}))}><SelectTrigger className="text-[12px] mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="wordpress">WordPress</SelectItem><SelectItem value="custom">Custom</SelectItem><SelectItem value="shopify">Shopify</SelectItem><SelectItem value="framer">Framer</SelectItem><SelectItem value="wix">Wix</SelectItem><SelectItem value="other">其他</SelectItem></SelectContent></Select></div>
                  <div><Label className="text-[12px]">開發進度</Label><Select value={newWebsite.devProgress} onValueChange={v => setNewWebsite(p => ({...p, devProgress: v}))}><SelectTrigger className="text-[12px] mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="planning">規劃中</SelectItem><SelectItem value="design">設計中</SelectItem><SelectItem value="development">開發中</SelectItem><SelectItem value="testing">測試中</SelectItem><SelectItem value="launched">已上線</SelectItem></SelectContent></Select></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-[12px]">負責同事</Label><Select value={newWebsite.assignedStaff} onValueChange={v => setNewWebsite(p => ({...p, assignedStaff: v}))}><SelectTrigger className="text-[12px] mt-1"><SelectValue placeholder="選擇同事" /></SelectTrigger><SelectContent>{staffOptions.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
                  <div><Label className="text-[12px]">投入工時 (小時) *</Label><Input type="number" min="0" step="0.5" placeholder="8" value={newWebsite.manHours} onChange={e => setNewWebsite(p => ({...p, manHours: e.target.value}))} className="text-[12px] mt-1" /></div>
                </div>
                <div><Label className="text-[12px]">成果連結 (URL)</Label><Input placeholder="https://完成的網址或設計圖連結" value={newWebsite.outputUrl} onChange={e => setNewWebsite(p => ({...p, outputUrl: e.target.value}))} className="text-[12px] mt-1" /></div>
                <div><Label className="text-[12px]">備註 / 對公司進步的成長經驗</Label><Textarea placeholder="記錄這次經驗對公司的貢獻或學到的知識..." value={newWebsite.notes} onChange={e => setNewWebsite(p => ({...p, notes: e.target.value}))} className="text-[12px] mt-1 min-h-[60px]" /></div>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <Button variant="outline" size="sm" onClick={() => setIsWebsiteModalOpen(false)}>取消</Button>
                <Button size="sm" className="bg-teal-600 hover:bg-teal-700 text-white" onClick={handleAddWebsite}>確認新增</Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* ═══ Modal: 新增文章 ═══ */}
          <Dialog open={isArticleModalOpen} onOpenChange={setIsArticleModalOpen}>
            <DialogContent className="sm:max-w-[520px]">
              <DialogHeader>
                <DialogTitle className="text-[15px]">新增文章</DialogTitle>
              </DialogHeader>
              <div className="space-y-1 mb-3">
                <div className="flex items-center gap-4 text-[11px] text-muted-foreground bg-slate-50 rounded p-2">
                  <span><Building2 size={11} className="inline mr-1" />公司：{project.company}</span>
                  <span><Palette size={11} className="inline mr-1" />品牌：{project.brand}</span>
                  <span><Target size={11} className="inline mr-1" />項目：{project.name}</span>
                </div>
                {project.projectCategory === 'client' && (
                  <div className="text-[11px] text-teal-700 bg-teal-50 rounded p-1.5 px-2"><User size={11} className="inline mr-1" />客戶：{project.clientName}</div>
                )}
              </div>
              <div className="grid gap-3">
                <div><Label className="text-[12px]">文章標題 *</Label><Input placeholder="輸入文章標題" value={newArticle.title} onChange={e => setNewArticle(p => ({...p, title: e.target.value}))} className="text-[12px] mt-1" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-[12px]">發佈頻道</Label><Select value={newArticle.channel} onValueChange={v => setNewArticle(p => ({...p, channel: v}))}><SelectTrigger className="text-[12px] mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="website_article">網站文章</SelectItem><SelectItem value="youtube">YouTube</SelectItem><SelectItem value="facebook">Facebook</SelectItem><SelectItem value="instagram">Instagram</SelectItem><SelectItem value="xiaohongshu">小紅書</SelectItem><SelectItem value="other_video">其他影片</SelectItem></SelectContent></Select></div>
                  <div><Label className="text-[12px]">作者</Label><Select value={newArticle.author} onValueChange={v => setNewArticle(p => ({...p, author: v}))}><SelectTrigger className="text-[12px] mt-1"><SelectValue placeholder="選擇作者" /></SelectTrigger><SelectContent>{staffOptions.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-[12px]">發佈日期</Label><Input type="date" value={newArticle.publishDate} onChange={e => setNewArticle(p => ({...p, publishDate: e.target.value}))} className="text-[12px] mt-1" /></div>
                  <div><Label className="text-[12px]">投入工時 (小時) *</Label><Input type="number" min="0" step="0.5" placeholder="4" value={newArticle.manHours} onChange={e => setNewArticle(p => ({...p, manHours: e.target.value}))} className="text-[12px] mt-1" /></div>
                </div>
                <div><Label className="text-[12px]">SEO 關鍵字</Label><Input placeholder="以逗號分隔，例：網頁設計, 香港網站" value={newArticle.seoKeywords} onChange={e => setNewArticle(p => ({...p, seoKeywords: e.target.value}))} className="text-[12px] mt-1" /></div>
                <div><Label className="text-[12px]">成果連結 (URL)</Label><Input placeholder="https://已發佈文章連結" value={newArticle.outputUrl} onChange={e => setNewArticle(p => ({...p, outputUrl: e.target.value}))} className="text-[12px] mt-1" /></div>
                <div><Label className="text-[12px]">備註 / 對公司進步的成長經驗</Label><Textarea placeholder="記錄這次經驗對公司的貢獻或學到的知識..." value={newArticle.notes} onChange={e => setNewArticle(p => ({...p, notes: e.target.value}))} className="text-[12px] mt-1 min-h-[60px]" /></div>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <Button variant="outline" size="sm" onClick={() => setIsArticleModalOpen(false)}>取消</Button>
                <Button size="sm" className="bg-teal-600 hover:bg-teal-700 text-white" onClick={handleAddArticle}>確認新增</Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* ═══ Modal: 新增影片 ═══ */}
          <Dialog open={isVideoModalOpen} onOpenChange={setIsVideoModalOpen}>
            <DialogContent className="sm:max-w-[520px]">
              <DialogHeader>
                <DialogTitle className="text-[15px]">新增影片</DialogTitle>
              </DialogHeader>
              <div className="space-y-1 mb-3">
                <div className="flex items-center gap-4 text-[11px] text-muted-foreground bg-slate-50 rounded p-2">
                  <span><Building2 size={11} className="inline mr-1" />公司：{project.company}</span>
                  <span><Palette size={11} className="inline mr-1" />品牌：{project.brand}</span>
                  <span><Target size={11} className="inline mr-1" />項目：{project.name}</span>
                </div>
                {project.projectCategory === 'client' && (
                  <div className="text-[11px] text-teal-700 bg-teal-50 rounded p-1.5 px-2"><User size={11} className="inline mr-1" />客戶：{project.clientName}</div>
                )}
              </div>
              <div className="grid gap-3">
                <div><Label className="text-[12px]">影片標題 *</Label><Input placeholder="輸入影片標題" value={newVideo.title} onChange={e => setNewVideo(p => ({...p, title: e.target.value}))} className="text-[12px] mt-1" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-[12px]">影片頻道</Label><Input placeholder="頻道名稱" value={newVideo.videoChannel} onChange={e => setNewVideo(p => ({...p, videoChannel: e.target.value}))} className="text-[12px] mt-1" /></div>
                  <div><Label className="text-[12px]">製作狀態</Label><Select value={newVideo.status} onValueChange={v => setNewVideo(p => ({...p, status: v}))}><SelectTrigger className="text-[12px] mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="planning">規劃中</SelectItem><SelectItem value="shooting">拍攝中</SelectItem><SelectItem value="post_production">後製中</SelectItem><SelectItem value="completed">已完成</SelectItem><SelectItem value="published">已發佈</SelectItem></SelectContent></Select></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-[12px]">拍攝日期</Label><Input type="date" value={newVideo.shootDate} onChange={e => setNewVideo(p => ({...p, shootDate: e.target.value}))} className="text-[12px] mt-1" /></div>
                  <div><Label className="text-[12px]">剪輯師</Label><Select value={newVideo.editor} onValueChange={v => setNewVideo(p => ({...p, editor: v}))}><SelectTrigger className="text-[12px] mt-1"><SelectValue placeholder="選擇剪輯師" /></SelectTrigger><SelectContent>{staffOptions.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
                </div>
                <div><Label className="text-[12px]">投入工時 (小時) *</Label><Input type="number" min="0" step="0.5" placeholder="8" value={newVideo.manHours} onChange={e => setNewVideo(p => ({...p, manHours: e.target.value}))} className="text-[12px] mt-1" /></div>
                <div><Label className="text-[12px]">成果連結 (URL)</Label><Input placeholder="https://影片連結或完成檔案" value={newVideo.outputUrl} onChange={e => setNewVideo(p => ({...p, outputUrl: e.target.value}))} className="text-[12px] mt-1" /></div>
                <div><Label className="text-[12px]">備註 / 對公司進步的成長經驗</Label><Textarea placeholder="記錄這次經驗對公司的貢獻或學到的知識..." value={newVideo.notes} onChange={e => setNewVideo(p => ({...p, notes: e.target.value}))} className="text-[12px] mt-1 min-h-[60px]" /></div>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <Button variant="outline" size="sm" onClick={() => setIsVideoModalOpen(false)}>取消</Button>
                <Button size="sm" className="bg-teal-600 hover:bg-teal-700 text-white" onClick={handleAddVideo}>確認新增</Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* ═══ Modal: 新增社交帖文 ═══ */}
          <Dialog open={isSocialModalOpen} onOpenChange={setIsSocialModalOpen}>
            <DialogContent className="sm:max-w-[520px]">
              <DialogHeader>
                <DialogTitle className="text-[15px]">新增社交帖文</DialogTitle>
              </DialogHeader>
              <div className="space-y-1 mb-3">
                <div className="flex items-center gap-4 text-[11px] text-muted-foreground bg-slate-50 rounded p-2">
                  <span><Building2 size={11} className="inline mr-1" />公司：{project.company}</span>
                  <span><Palette size={11} className="inline mr-1" />品牌：{project.brand}</span>
                  <span><Target size={11} className="inline mr-1" />項目：{project.name}</span>
                </div>
                {project.projectCategory === 'client' && (
                  <div className="text-[11px] text-teal-700 bg-teal-50 rounded p-1.5 px-2"><User size={11} className="inline mr-1" />客戶：{project.clientName}</div>
                )}
              </div>
              <div className="grid gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-[12px]">發佈平台 *</Label><Select value={newSocial.platform} onValueChange={v => setNewSocial(p => ({...p, platform: v}))}><SelectTrigger className="text-[12px] mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="facebook">Facebook</SelectItem><SelectItem value="instagram">Instagram</SelectItem><SelectItem value="xiaohongshu">小紅書</SelectItem><SelectItem value="linkedin">LinkedIn</SelectItem><SelectItem value="youtube">YouTube</SelectItem><SelectItem value="twitter">Twitter / X</SelectItem><SelectItem value="other">其他</SelectItem></SelectContent></Select></div>
                  <div><Label className="text-[12px]">作者</Label><Select value={newSocial.author} onValueChange={v => setNewSocial(p => ({...p, author: v}))}><SelectTrigger className="text-[12px] mt-1"><SelectValue placeholder="選擇作者" /></SelectTrigger><SelectContent>{staffOptions.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
                </div>
                <div><Label className="text-[12px]">帖文內容 *</Label><Textarea placeholder="輸入帖文內容..." value={newSocial.content} onChange={e => setNewSocial(p => ({...p, content: e.target.value}))} className="text-[12px] mt-1 min-h-[80px]" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-[12px]">排期日期</Label><Input type="date" value={newSocial.scheduledDate} onChange={e => setNewSocial(p => ({...p, scheduledDate: e.target.value}))} className="text-[12px] mt-1" /></div>
                  <div><Label className="text-[12px]">投入工時 (小時) *</Label><Input type="number" min="0" step="0.5" placeholder="2" value={newSocial.manHours} onChange={e => setNewSocial(p => ({...p, manHours: e.target.value}))} className="text-[12px] mt-1" /></div>
                </div>
                <div><Label className="text-[12px]">成果連結 (URL)</Label><Input placeholder="https://帖文連結或設計圖連結" value={newSocial.outputUrl} onChange={e => setNewSocial(p => ({...p, outputUrl: e.target.value}))} className="text-[12px] mt-1" /></div>
                <div><Label className="text-[12px]">備註 / 對公司進步的成長經驗</Label><Textarea placeholder="記錄這次經驗對公司的貢獻或學到的知識..." value={newSocial.notes} onChange={e => setNewSocial(p => ({...p, notes: e.target.value}))} className="text-[12px] mt-1 min-h-[60px]" /></div>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <Button variant="outline" size="sm" onClick={() => setIsSocialModalOpen(false)}>取消</Button>
                <Button size="sm" className="bg-teal-600 hover:bg-teal-700 text-white" onClick={handleAddSocial}>確認新增</Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* ═══ Modal: 新增付費廣告 ═══ */}
          <Dialog open={isAdModalOpen} onOpenChange={setIsAdModalOpen}>
            <DialogContent className="sm:max-w-[520px]">
              <DialogHeader>
                <DialogTitle className="text-[15px]">新增付費廣告</DialogTitle>
              </DialogHeader>
              <div className="space-y-1 mb-3">
                <div className="flex items-center gap-4 text-[11px] text-muted-foreground bg-slate-50 rounded p-2">
                  <span><Building2 size={11} className="inline mr-1" />公司：{project.company}</span>
                  <span><Palette size={11} className="inline mr-1" />品牌：{project.brand}</span>
                  <span><Target size={11} className="inline mr-1" />項目：{project.name}</span>
                </div>
                {project.projectCategory === 'client' && (
                  <div className="text-[11px] text-teal-700 bg-teal-50 rounded p-1.5 px-2"><User size={11} className="inline mr-1" />客戶：{project.clientName}</div>
                )}
              </div>
              <div className="grid gap-3">
                <div><Label className="text-[12px]">廣告活動名稱 *</Label><Input placeholder="輸入廣告活動名稱" value={newAd.campaignName} onChange={e => setNewAd(p => ({...p, campaignName: e.target.value}))} className="text-[12px] mt-1" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-[12px]">廣告平台</Label><Select value={newAd.platform} onValueChange={v => setNewAd(p => ({...p, platform: v}))}><SelectTrigger className="text-[12px] mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="google_ads">Google Ads</SelectItem><SelectItem value="facebook">Facebook</SelectItem><SelectItem value="instagram">Instagram</SelectItem><SelectItem value="xiaohongshu">小紅書</SelectItem><SelectItem value="other">其他</SelectItem></SelectContent></Select></div>
                  <div><Label className="text-[12px]">貨幣</Label><Select value={newAd.currency} onValueChange={v => setNewAd(p => ({...p, currency: v}))}><SelectTrigger className="text-[12px] mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="HKD">HKD</SelectItem><SelectItem value="USD">USD</SelectItem><SelectItem value="CNY">CNY</SelectItem></SelectContent></Select></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-[12px]">預算金額</Label><Input type="number" min="0" placeholder="10000" value={newAd.budget} onChange={e => setNewAd(p => ({...p, budget: e.target.value}))} className="text-[12px] mt-1" /></div>
                  <div><Label className="text-[12px]">投入工時 (小時) *</Label><Input type="number" min="0" step="0.5" placeholder="4" value={newAd.manHours} onChange={e => setNewAd(p => ({...p, manHours: e.target.value}))} className="text-[12px] mt-1" /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-[12px]">開始日期</Label><Input type="date" value={newAd.startDate} onChange={e => setNewAd(p => ({...p, startDate: e.target.value}))} className="text-[12px] mt-1" /></div>
                  <div><Label className="text-[12px]">結束日期</Label><Input type="date" value={newAd.endDate} onChange={e => setNewAd(p => ({...p, endDate: e.target.value}))} className="text-[12px] mt-1" /></div>
                </div>
                <div><Label className="text-[12px]">成果連結 (URL)</Label><Input placeholder="https://廣告後台截圖或報告連結" value={newAd.outputUrl} onChange={e => setNewAd(p => ({...p, outputUrl: e.target.value}))} className="text-[12px] mt-1" /></div>
                <div><Label className="text-[12px]">備註 / 對公司進步的成長經驗</Label><Textarea placeholder="記錄這次經驗對公司的貢獻或學到的知識..." value={newAd.notes} onChange={e => setNewAd(p => ({...p, notes: e.target.value}))} className="text-[12px] mt-1 min-h-[60px]" /></div>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <Button variant="outline" size="sm" onClick={() => setIsAdModalOpen(false)}>取消</Button>
                <Button size="sm" className="bg-teal-600 hover:bg-teal-700 text-white" onClick={handleAddAd}>確認新增</Button>
              </div>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* ═══════════════════════════════════════════════ */}
        {/* Tab 4: 年度計劃 (Year Plan) */}
        {/* ═══════════════════════════════════════════════ */}
        <TabsContent value="year-plan" className="mt-6 space-y-6">
          {/* Year Plan Modal */}
          <Dialog open={isYearPlanModalOpen} onOpenChange={setIsYearPlanModalOpen}>
            <DialogContent className="sm:max-w-[480px]">
              <DialogHeader>
                <DialogTitle>{yearPlan ? '修改年度目標' : '設定年度目標'}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div className="bg-slate-50 rounded-md p-3 text-[12px] text-muted-foreground space-y-0.5">
                  <p>年度：<span className="text-foreground font-medium">{new Date().getFullYear()}</span></p>
                  <p>所屬公司：<span className="text-foreground font-medium">{project.company}</span></p>
                  <p>所屬品牌：<span className="text-foreground font-medium">{project.brand}</span></p>
                </div>
                <div className="space-y-2">
                  <Label className="text-[13px]">目標營收 (HKD)</Label>
                  <Input
                    type="number"
                    value={yearPlanForm.targetRevenue}
                    onChange={(e) => setYearPlanForm({ ...yearPlanForm, targetRevenue: e.target.value })}
                    placeholder="500000"
                    className="text-[13px]"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-[13px]">目標項目數</Label>
                    <Input
                      type="number"
                      value={yearPlanForm.targetProjects}
                      onChange={(e) => setYearPlanForm({ ...yearPlanForm, targetProjects: e.target.value })}
                      placeholder="20"
                      className="text-[13px]"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[13px]">目標文章數</Label>
                    <Input
                      type="number"
                      value={yearPlanForm.targetArticles}
                      onChange={(e) => setYearPlanForm({ ...yearPlanForm, targetArticles: e.target.value })}
                      placeholder="60"
                      className="text-[13px]"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-[13px]">目標影片數</Label>
                    <Input
                      type="number"
                      value={yearPlanForm.targetVideos}
                      onChange={(e) => setYearPlanForm({ ...yearPlanForm, targetVideos: e.target.value })}
                      placeholder="30"
                      className="text-[13px]"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[13px]">目標社交帖數</Label>
                    <Input
                      type="number"
                      value={yearPlanForm.targetSocialPosts}
                      onChange={(e) => setYearPlanForm({ ...yearPlanForm, targetSocialPosts: e.target.value })}
                      placeholder="120"
                      className="text-[13px]"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" size="sm" onClick={() => setIsYearPlanModalOpen(false)}>取消</Button>
                  <Button size="sm" className="bg-teal-600 hover:bg-teal-700" onClick={handleSaveYearPlan} disabled={isSavingYearPlan}>
                    {isSavingYearPlan ? (
                      <span className="flex items-center gap-1.5">
                        <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        儲存中...
                      </span>
                    ) : '確認儲存'}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* No year plan set */}
          {!yearPlan && (
            <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-[0_2px_6px_rgba(0,20,40,0.05)] p-10 text-center">
              <Target size={40} className="mx-auto text-muted-foreground/40 mb-4" />
              <h4 className="text-[16px] font-bold mb-2">尚未設定年度目標</h4>
              <p className="text-[13px] text-muted-foreground mb-6">
                請為品牌「{project.brand}」設定 {new Date().getFullYear()} 年度目標，以便追蹤達成率。
              </p>
              <Button size="sm" className="bg-teal-600 hover:bg-teal-700 text-white gap-1.5" onClick={openYearPlanModal}>
                <Plus size={14} />
                立即設定
              </Button>
            </div>
          )}

          {/* Year plan exists */}
          {yearPlan && (
            <>
              <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-[0_2px_6px_rgba(0,20,40,0.05)] p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h4 className="text-[16px] font-bold">{yearPlan.year} 年度目標</h4>
                    <p className="text-[12px] text-muted-foreground mt-0.5">品牌：{project.brand} | 公司：{project.company}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className="bg-teal-50 text-teal-700 text-[11px]">
                      <Target size={12} className="mr-1" />
                      進行中
                    </Badge>
                    <Button size="sm" variant="outline" className="gap-1.5 text-[12px]" onClick={openYearPlanModal}>
                      <Edit size={12} />
                      設定 / 修改年度目標
                    </Button>
                  </div>
                </div>
              </div>

              {/* Year plan metrics */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <YearPlanCard
                  label="營收目標"
                  current={actualData.actualRevenue}
                  target={yearPlan.targetRevenue}
                  unit="HKD"
                  formatFn={(v) => `$${(v / 1000).toFixed(0)}K`}
                />
                <YearPlanCard
                  label="項目數目標"
                  current={actualData.actualProjects}
                  target={yearPlan.targetProjects}
                  unit="個"
                  formatFn={(v) => `${v}`}
                />
                <YearPlanCard
                  label="文章數目標"
                  current={actualData.actualArticles}
                  target={yearPlan.targetArticles}
                  unit="篇"
                  formatFn={(v) => `${v}`}
                />
                <YearPlanCard
                  label="影片數目標"
                  current={actualData.actualVideos}
                  target={yearPlan.targetVideos}
                  unit="條"
                  formatFn={(v) => `${v}`}
                />
                <YearPlanCard
                  label="社交帖文目標"
                  current={actualData.actualSocialPosts}
                  target={yearPlan.targetSocialPosts}
                  unit="篇"
                  formatFn={(v) => `${v}`}
                />
              </div>

              {/* Overall progress */}
              <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-[0_2px_6px_rgba(0,20,40,0.05)] p-5">
                <h4 className="text-[14px] font-bold mb-4">整體達成率</h4>
                <div className="space-y-3">
                  <YearProgressBar label="營收" current={actualData.actualRevenue} target={yearPlan.targetRevenue} />
                  <YearProgressBar label="項目" current={actualData.actualProjects} target={yearPlan.targetProjects} />
                  <YearProgressBar label="文章" current={actualData.actualArticles} target={yearPlan.targetArticles} />
                  <YearProgressBar label="影片" current={actualData.actualVideos} target={yearPlan.targetVideos} />
                  <YearProgressBar label="帖文" current={actualData.actualSocialPosts} target={yearPlan.targetSocialPosts} />
                </div>
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ═══════════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════════

function YearPlanCard({ label, current, target, unit, formatFn }: {
  label: string;
  current: number;
  target: number;
  unit: string;
  formatFn: (v: number) => string;
}) {
  const percent = target > 0 ? Math.round((current / target) * 100) : 0;
  const colorClass = percent >= 70 ? 'bg-teal-50 text-teal-700' : percent >= 30 ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700';
  const progressColor = percent >= 70 ? 'bg-teal-500' : percent >= 30 ? 'bg-amber-400' : 'bg-rose-500';

  return (
    <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-[0_2px_6px_rgba(0,20,40,0.05)] p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[12px] font-medium text-muted-foreground">{label}</span>
        <span className={cn('text-[11px] font-medium px-1.5 py-0.5 rounded', colorClass)}>
          {percent}%
        </span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-[20px] font-bold">{formatFn(current)}</span>
        <span className="text-[12px] text-muted-foreground">/ {formatFn(target)} {unit}</span>
      </div>
      <div className="h-2 mt-3 bg-muted rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full transition-all', progressColor)} style={{ width: `${Math.min(percent, 100)}%` }} />
      </div>
    </div>
  );
}

function YearProgressBar({ label, current, target }: { label: string; current: number; target: number }) {
  const percent = target > 0 ? Math.min(Math.round((current / target) * 100), 100) : 0;
  const progressColor = percent >= 70 ? 'bg-teal-500' : percent >= 30 ? 'bg-amber-400' : 'bg-rose-500';
  return (
    <div className="flex items-center gap-3">
      <span className="text-[12px] text-muted-foreground w-10">{label}</span>
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all', progressColor)}
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="text-[11px] font-medium w-10 text-right">{percent}%</span>
    </div>
  );
}
