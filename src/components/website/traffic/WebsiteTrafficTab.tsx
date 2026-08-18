import { useEffect, useState } from 'react';
import { BarChart3, ExternalLink } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { setGa4TrafficHash } from '@/lib/ga4Navigation';
import { writeSelectedWebsiteId } from '@/lib/websiteNavigation';
import type { WebsiteProfileFull } from '@/types/app';

type PropertyRow = {
  property_id: string;
  display_name: string | null;
  account_name: string | null;
  measurement_id: string | null;
  matched_domain: string | null;
};

export function WebsiteTrafficTab({ site }: { site: WebsiteProfileFull }) {
  const [properties, setProperties] = useState<PropertyRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    supabase
      .from('ga4_properties')
      .select('property_id, display_name, account_name, measurement_id, matched_domain')
      .eq('website_profile_id', site.id)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setProperties([]);
        } else {
          setProperties((data || []) as PropertyRow[]);
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [site.id]);

  const openReport = (propertyId?: string) => {
    writeSelectedWebsiteId(null);
    setGa4TrafficHash({
      propertyId: propertyId || null,
      preset: '30d',
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-[15px] font-bold">網站流量</h4>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            GA4 報表與 Google Ads Campaign 詳情同一版面（KPI、趨勢圖、渠道、細項）
          </p>
        </div>
        <button
          type="button"
          onClick={() => openReport(properties[0]?.property_id)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded-md text-[12px] font-medium hover:bg-teal-700 transition-colors"
        >
          <BarChart3 size={13} />
          開啟流量報告
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground text-[13px]">載入中…</div>
      ) : properties.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-border rounded-md">
          <BarChart3 size={32} className="text-muted-foreground mx-auto mb-3" />
          <p className="text-[14px] font-medium text-muted-foreground">尚未對應 GA4 property</p>
          <p className="text-[12px] text-muted-foreground mt-1">
            請先完成 docs/ga4-setup.md，再到「網站流量」按同步。對不上時可在網站資料填 `ga4_property_id`。
          </p>
        </div>
      ) : (
        <div className="bg-white border border-[rgba(13,26,45,0.08)] rounded-md overflow-hidden">
          <table className="w-full text-[13px]">
            <thead className="bg-slate-50 text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-2.5">Property</th>
                <th className="text-left font-medium px-4 py-2.5">帳戶</th>
                <th className="text-left font-medium px-4 py-2.5">Measurement ID</th>
                <th className="text-right font-medium px-4 py-2.5">操作</th>
              </tr>
            </thead>
            <tbody>
              {properties.map((row) => (
                <tr key={row.property_id} className="border-t border-slate-100">
                  <td className="px-4 py-2.5">
                    <div className="font-medium">{row.display_name || row.property_id}</div>
                    <div className="text-[11px] text-muted-foreground font-mono">{row.property_id}</div>
                  </td>
                  <td className="px-4 py-2.5">{row.account_name || '—'}</td>
                  <td className="px-4 py-2.5 font-mono text-[12px]">{row.measurement_id || '—'}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => openReport(row.property_id)}
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
