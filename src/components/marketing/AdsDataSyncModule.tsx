import { useGoogleAdsBackfill } from '@/hooks/useGoogleAdsBackfill';
import { useFacebookAdsBackfill } from '@/hooks/useFacebookAdsBackfill';
import { AdsSyncPanel } from './AdsSyncPanel';

export function AdsDataSyncModule() {
  const google = useGoogleAdsBackfill();
  const facebook = useFacebookAdsBackfill();

  return (
    <div className="space-y-8">
      <div className="sticky top-[48px] z-30 -mx-6 px-6 pt-1 pb-3 mb-5 space-y-3 bg-[#f5f8fc]/95 backdrop-blur-sm border-b border-[rgba(13,26,45,0.06)]">
        <div>
          <h1 className="text-[32px] font-bold tracking-tight">廣告數據同步</h1>
          <p className="text-[14px] text-muted-foreground mt-1">
            觸發並監控 Google Ads 與 Facebook Ads 的完整歷史回填，以及日常增量同步狀態。
          </p>
        </div>
      </div>

      <AdsSyncPanel
        title="Google Ads"
        job={google.job}
        loading={google.loading}
        working={google.working}
        error={google.error}
        autoRun={google.autoRun}
        start={google.start}
        pause={google.pause}
        resume={google.resume}
        cancel={google.cancel}
        refreshJob={google.refreshJob}
        extraStats={
          <>
            <div>
              <div className="text-muted-foreground text-[11px]">網站連結數</div>
              <div className="font-medium">{google.job?.meta?.websites_linked ?? '—'}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-[11px]">未對應網域</div>
              <div className="font-medium">{google.job?.meta?.domains_unmatched ?? '—'}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-[11px]">有連結的 Campaign</div>
              <div className="font-medium">{google.job?.meta?.campaigns_with_links ?? '—'}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-[11px]">PMax 已連結</div>
              <div className="font-medium">{google.job?.meta?.pmax_campaigns_with_links ?? '—'}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-[11px]">發現網域數</div>
              <div className="font-medium">{google.job?.meta?.domains_discovered ?? '—'}</div>
            </div>
          </>
        }
        helpText={
          <>
            完整歷史以「每月一個步驟」推進，避免 Edge Function 逾時。執行中請保持此分頁開啟以自動推進；關閉後可按「繼續」從資料庫游標恢復。
            啟動時會依廣告 Final URL、Performance Max 資產組 URL、landing page，以及帳戶／Campaign 名稱中的網域自動對應 `webandsystem_list`；未對應網域可到「網站列表」用「同步廣告網域」建立。
          </>
        }
      />

      <AdsSyncPanel
        title="Facebook Ads"
        job={facebook.job}
        loading={facebook.loading}
        working={facebook.working}
        error={facebook.error}
        autoRun={facebook.autoRun}
        start={facebook.start}
        pause={facebook.pause}
        resume={facebook.resume}
        cancel={facebook.cancel}
        refreshJob={facebook.refreshJob}
        helpText={
          <>
            Meta Insights 約僅保留近 37 個月資料。完整歷史以「每月一個步驟」推進，避免 Edge Function 逾時。
            執行中請保持此分頁開啟以自動推進；關閉後可按「繼續」從資料庫游標恢復。
            會同步 <code className="text-[11px]">META_CREDENTIALS_JSON</code> 內全部 Business 憑證下的廣告帳戶（增刪憑證後按增量同步會自動更新帳戶清單）。
            {facebook.job?.meta?.businesses?.length
              ? ` 目前任務涵蓋：${facebook.job.meta.businesses.join('、')}。`
              : ''}
            {' '}Campaign 品牌請至「Facebook Ads」報表頁手動設定。
          </>
        }
      />
    </div>
  );
}
