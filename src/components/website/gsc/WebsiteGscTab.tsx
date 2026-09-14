import { useEffect, useState } from 'react';
import { ExternalLink, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { gscPermissionLabel, isGscAnalyticsReadable } from '@/lib/analyticsToolConnections';
import { setGscReportHash } from '@/lib/gscNavigation';
import { writeSelectedWebsiteId } from '@/lib/websiteNavigation';
import type { WebsiteProfileFull } from '@/types/app';

type SiteRow = {
  site_url: string;
  permission_level: string | null;
  matched_domain: string | null;
};

export function WebsiteGscTab({ site }: { site: WebsiteProfileFull }) {
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    supabase
      .from('gsc_sites')
      .select('site_url, permission_level, matched_domain')
      .eq('website_profile_id', site.id)
      .then(({ data, error }) => {
        if (cancelled) return;
        setSites(error ? [] : ((data || []) as SiteRow[]));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [site.id]);

  const openReport = (siteUrl?: string) => {
    writeSelectedWebsiteId(null);
    setGscReportHash({
      siteUrl: siteUrl || null,
      preset: '30d',
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-[15px] font-bold">Search Console</h4>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            GSC 搜尋成效（Clicks、Impressions、CTR、Position、Queries、Pages）。SEO 關鍵字頁只做規劃清單。
          </p>
        </div>
        <button
          type="button"
          onClick={() => openReport(sites[0]?.site_url)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded-md text-[12px] font-medium hover:bg-teal-700 transition-colors"
        >
          <Search size={13} />
          開啟 GSC 報告
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground text-[13px]">載入中…</div>
      ) : sites.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-border rounded-md">
          <Search size={32} className="text-muted-foreground mx-auto mb-3" />
          <p className="text-[14px] font-medium text-muted-foreground">尚未對應 GSC 資源</p>
          <p className="text-[12px] text-muted-foreground mt-1">
            請到「廣告數據同步」授權 Search Console，或按網站列表的「同步 GSC」。
          </p>
        </div>
      ) : (
        <div className="bg-white border border-[rgba(13,26,45,0.08)] rounded-md overflow-hidden">
          <table className="w-full text-[13px]">
            <thead className="bg-slate-50 text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-2.5">GSC 資源</th>
                <th className="text-left font-medium px-4 py-2.5">權限</th>
                <th className="text-right font-medium px-4 py-2.5">操作</th>
              </tr>
            </thead>
            <tbody>
              {sites.map((row) => (
                <tr key={row.site_url} className="border-t border-slate-100">
                  <td className="px-4 py-2.5">
                    <div className="font-medium">{row.matched_domain || row.site_url}</div>
                    <div className="text-[11px] text-muted-foreground font-mono break-all">{row.site_url}</div>
                  </td>
                  <td className="px-4 py-2.5">
                    {gscPermissionLabel(row.permission_level) || '—'}
                    {!isGscAnalyticsReadable(row.permission_level) ? (
                      <div className="text-[11px] text-muted-foreground">無法讀取查詢</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => openReport(row.site_url)}
                      className="inline-flex items-center gap-1 text-[12px] text-teal-700 hover:underline"
                    >
                      開啟報告 <ExternalLink size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
