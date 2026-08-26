import { CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLoginLogs } from '@/hooks/useLoginLogs';
import { formatLoginLogTime } from '@/lib/loginLogs';

export function LoginLogsSettings() {
  const { logs, loading, error } = useLoginLogs();

  return (
    <div className="space-y-5">
      <h3 className="text-[18px] font-bold">登入紀錄</h3>
      <p className="text-[13px] text-muted-foreground">最近 50 筆用戶登入記錄。</p>
      {error && (
        <p className="text-[13px] text-red-600">無法讀取登入紀錄：{error}</p>
      )}
      <div className="border border-border/50 rounded-md overflow-hidden">
        <table className="w-full text-[13px]">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">用戶</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">電郵</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">方式</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">結果</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">登入時間</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-muted-foreground">載入中…</td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-muted-foreground">尚無登入紀錄。</td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="border-t border-border/50 hover:bg-muted/20">
                  <td className="px-4 py-2.5 font-medium">{log.displayName}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{log.email}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{log.loginMethodLabel}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium',
                        log.success ? 'bg-teal-50 text-teal-700' : 'bg-red-50 text-red-700',
                      )}
                    >
                      {log.success ? <CheckCircle2 size={11} /> : <XCircle size={11} />}
                      {log.success ? '成功' : '失敗'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground font-mono text-[12px]">
                    {formatLoginLogTime(log.createdAt)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
