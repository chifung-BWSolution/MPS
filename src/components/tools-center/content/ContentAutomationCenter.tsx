import { useCallback, useEffect, useMemo, useState } from 'react';
import { DatabaseZap, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  buildContentHash,
  pageMeta,
  parseContentRoute,
  rememberZone,
  routeKey,
  type ContentNavigate,
} from '@/lib/contentNavigation.ts';
import type { ContentPage, ContentRoute, ContentZone } from '@/lib/contentTypes.ts';
import { detectContentSchema } from '@/lib/contentApi.ts';
import { ContentEmptyState } from './shell/ContentEmptyState';
import { ContentErrorBoundary } from './shell/ContentErrorBoundary';
import { ContentMetricBar, type ContentMetricItem } from './shell/ContentMetricBar';
import { ContentZoneTabs } from './shell/ContentZoneTabs';
import { useContentInbox } from '@/hooks/useContentInbox';
import { SocialDeskView } from './social/SocialDeskView';
import { SiteListView } from './seo/SiteListView';
import { SiteWizard } from './seo/SiteWizard';
import { SiteDetailView } from './seo/SiteDetailView';
import { KeywordLibraryView } from './seo/KeywordLibraryView';
import { PlanBoardView } from './seo/PlanBoardView';
import { ArticleQueueView } from './seo/ArticleQueueView';
import { ArticleStudioView } from './seo/ArticleStudioView';
import { PublishLogView } from './seo/PublishLogView';
import { DigestView } from './seo/DigestView';
import { ContentSettingsView } from './seo/ContentSettingsView';
import { UsageView } from './seo/UsageView';

type SchemaState = 'checking' | 'ready' | 'missing';

function readRoute(): ContentRoute {
  if (typeof window === 'undefined') {
    return { zone: 'social', page: 'overview', id: null };
  }
  return parseContentRoute(window.location.hash);
}

/**
 * 社媒自動化營運 · 插件外殼（PRD §5.2、M0-17、M0-19）
 *
 * 職責：
 *   1. 兩區切換 + 二級路由（hash query）同步
 *   2. 資料表未建立（42P01）時降級為「功能尚未啟用」，不白屏
 *   3. 頁面級錯誤邊界
 *   4. 頂部收件匣數字（SEO 區）
 */
export function ContentAutomationCenter() {
  const [route, setRoute] = useState<ContentRoute>(readRoute);
  const [schema, setSchema] = useState<SchemaState>('checking');
  const [schemaChecking, setSchemaChecking] = useState(false);

  const navigate = useCallback<ContentNavigate>((zone, page, id) => {
    const hash = buildContentHash(zone, page, id);
    if (window.location.hash !== hash) {
      window.location.hash = hash;
    }
    setRoute({ zone, page, id: id ?? null });
    rememberZone(zone);
  }, []);

  const checkSchema = useCallback(async () => {
    setSchemaChecking(true);
    try {
      const ready = await detectContentSchema();
      setSchema(ready ? 'ready' : 'missing');
    } catch {
      setSchema('missing');
    } finally {
      setSchemaChecking(false);
    }
  }, []);

  useEffect(() => {
    void checkSchema();
  }, [checkSchema]);

  useEffect(() => {
    const onHashChange = () => {
      const next = readRoute();
      setRoute(next);
      rememberZone(next.zone);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const switchZone = useCallback(
    (zone: ContentZone) => {
      if (zone === route.zone) return;
      const page: ContentPage = zone === 'social' ? 'overview' : 'sites';
      navigate(zone, page);
    },
    [navigate, route.zone],
  );

  const inbox = useContentInbox(schema === 'ready' && route.zone === 'seo');

  const metricItems = useMemo<ContentMetricItem[]>(
    () => [
      {
        label: '待審',
        value: inbox.counts.pendingReview,
        tone: inbox.counts.pendingReview > 0 ? 'warn' : 'default',
        onClick: () => navigate('seo', 'articles'),
        hint: '前往文章佇列',
      },
      {
        label: '待回填',
        value: inbox.counts.manualPending,
        tone: inbox.counts.manualPending > 0 ? 'info' : 'default',
        onClick: () => navigate('seo', 'publish'),
        hint: '內容包已產生，等待回填上線 URL',
      },
      {
        label: '失敗',
        value: inbox.counts.failed,
        tone: inbox.counts.failed > 0 ? 'danger' : 'default',
        onClick: () => navigate('seo', 'publish'),
        hint: '發布或驗證失敗的文章',
      },
      {
        label: '保留',
        value: inbox.counts.held,
        tone: inbox.counts.held > 0 ? 'warn' : 'default',
        onClick: () => navigate('seo', 'articles'),
        hint: '已保留，不會自動發布',
      },
      {
        label: '缺關鍵字',
        value: inbox.counts.missingKeywords,
        tone: inbox.counts.missingKeywords > 0 ? 'warn' : 'default',
        onClick: () => navigate('seo', 'plan'),
        hint: '排程格尚未指派關鍵字',
      },
    ],
    [inbox.counts, navigate],
  );

  const meta = pageMeta(route);

  const renderBody = () => {
    if (schema === 'missing') {
      return (
        <ContentEmptyState
          icon={DatabaseZap}
          tone="warning"
          title="功能尚未啟用"
          description="內容自動化的資料表還沒建立（Postgres 42P01）。請先執行本次 migration，再重新載入；在那之前這個入口不會影響其他模組。"
          action={
            <Button size="sm" variant="outline" onClick={() => void checkSchema()}>
              <RefreshCw size={13} className={schemaChecking ? 'animate-spin' : undefined} />
              重新檢查
            </Button>
          }
        >
          <ol className="space-y-1 text-[12px] leading-relaxed text-slate-600">
            <li>1. 在專案根目錄執行 `npm run db:push`（推送 6 支 content migration）。</li>
            <li>2. 部署 5 支 content-* Edge Functions 並設定 `CONTENT_VAULT_KEY`。</li>
            <li>3. 回到本頁按「重新檢查」。</li>
          </ol>
        </ContentEmptyState>
      );
    }

    if (schema === 'checking') {
      return (
        <div className="space-y-2">
          <div className="h-24 animate-pulse rounded-lg border border-[rgba(13,26,45,0.08)] bg-white shadow-card" />
          <div className="h-56 animate-pulse rounded-lg border border-[rgba(13,26,45,0.08)] bg-white shadow-card" />
        </div>
      );
    }

    if (route.zone === 'social') {
      return <SocialDeskView route={route} navigate={navigate} />;
    }

    switch (route.page) {
      case 'sites':
        return <SiteListView route={route} navigate={navigate} />;
      case 'site':
        return route.id ? (
          <SiteDetailView route={route} navigate={navigate} />
        ) : (
          <SiteWizard route={route} navigate={navigate} />
        );
      case 'keywords':
        return <KeywordLibraryView route={route} navigate={navigate} />;
      case 'plan':
        return <PlanBoardView route={route} navigate={navigate} />;
      case 'articles':
        return <ArticleQueueView route={route} navigate={navigate} />;
      case 'studio':
        return <ArticleStudioView route={route} navigate={navigate} />;
      case 'publish':
        return <PublishLogView route={route} navigate={navigate} />;
      case 'digest':
        return <DigestView route={route} navigate={navigate} />;
      case 'usage':
        return <UsageView route={route} navigate={navigate} />;
      case 'settings':
        return <ContentSettingsView route={route} navigate={navigate} />;
      default:
        return (
          <ContentEmptyState
            title={`找不到頁面：${meta.label}`}
            description="這個頁面可能已改名，或連結不完整。"
            action={
              <Button size="sm" onClick={() => navigate('seo', 'sites')}>
                回到站點清單
              </Button>
            }
          />
        );
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ContentZoneTabs
          zone={route.zone}
          onChange={switchZone}
          counts={route.zone === 'seo' ? { seo: inbox.counts.pendingReview } : {}}
        />
        {route.zone === 'seo' && schema === 'ready' && (
          <ContentMetricBar
            items={metricItems}
            loading={inbox.loading}
            actions={
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 px-2 text-muted-foreground"
                onClick={() => void inbox.refresh()}
                title="重新整理數字"
              >
                <RefreshCw size={13} />
              </Button>
            }
          />
        )}
      </div>

      <ContentErrorBoundary resetKey={routeKey(route)}>{renderBody()}</ContentErrorBoundary>
    </div>
  );
}
