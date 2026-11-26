import { Loader2, Power } from 'lucide-react';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { can } from '@/lib/contentPermissions.ts';
import { useSocialAutopilot } from '@/hooks/useSocialAutopilot.ts';

/**
 * 社媒營運 · 自動營運總開關（右上角）。
 * 只有管理層可以切換；其他人看得到狀態但不能改。
 * 關閉後：RSS 抓取與 cron 自動產稿停止，手動「立即生成」仍可用。
 */
export function SocialAutopilotSwitch({ className }: { className?: string }) {
  const { systemUser } = useAuth();
  const canManage = can({ role: systemUser?.role ?? null }, 'manage_settings');
  const { enabled, loading, acting, error, setEnabled } = useSocialAutopilot();

  const handleToggle = async (next: boolean) => {
    if (!canManage) {
      toast.error('只有管理層可以切換自動營運');
      return;
    }
    try {
      await setEnabled(next);
      toast.success(next ? '自動營運已開啟：會繼續抓熱點與產稿' : '自動營運已暫停：不再抓取或自動產稿');
    } catch (thrown) {
      toast.error(thrown instanceof Error ? thrown.message : '切換失敗');
    }
  };

  return (
    <div
      className={cn(
        'inline-flex items-center gap-2 rounded-lg border border-[rgba(13,26,45,0.08)] bg-white px-3 py-1.5 shadow-card',
        className,
      )}
      title={
        error
          ? `無法讀取自動營運狀態：${error}`
          : enabled
            ? '自動營運中：每小時抓熱點、每 2 分鐘自動產稿'
            : '已暫停：不再抓取或自動產稿（手動生成仍可用）'
      }
    >
      <Power size={13} className={enabled ? 'text-teal-600' : 'text-slate-400'} />
      <span className="text-[12px] font-semibold text-[#0d1a2d]">自動營運</span>
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded px-1.5 py-[1px] text-[10.5px] font-semibold',
          enabled ? 'bg-teal-50 text-teal-700' : 'bg-slate-100 text-slate-500',
        )}
      >
        <span className={cn('h-1.5 w-1.5 rounded-full', enabled ? 'bg-teal-500' : 'bg-slate-400')} />
        {loading ? '讀取中' : enabled ? '運行中' : '已暫停'}
      </span>
      {acting && <Loader2 size={12} className="animate-spin text-slate-400" />}
      <Switch
        checked={enabled}
        disabled={!canManage || acting || loading}
        onCheckedChange={(next) => void handleToggle(next)}
        aria-label="切換自動營運"
      />
    </div>
  );
}
