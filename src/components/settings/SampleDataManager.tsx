/**
 * ============================================================
 * Sample Data Manager — 模擬數據管理面板
 * ============================================================
 * 管理模擬數據的顯示/隱藏/清除
 * 可在 Settings 頁面或全局使用
 * ============================================================
 */
import { useState } from 'react';
import { useDataStore } from '@/context/DataStore';
import { SAMPLE_BADGE_TEXT } from '@/data/sampleDataRegistry';
import { Database, Trash2, RotateCcw, AlertTriangle, Eye, EyeOff, CheckCircle2 } from 'lucide-react';

export function SampleDataManager() {
  const {
    sampleDataEnabled,
    setSampleDataEnabled,
    clearAllSampleData,
    restoreSampleData,
    sampleDataSummary,
  } = useDataStore();

  const [showConfirmClear, setShowConfirmClear] = useState(false);
  const [showConfirmRestore, setShowConfirmRestore] = useState(false);

  const { totalSample, totalReal, breakdown } = sampleDataSummary;

  const moduleLabels: Record<string, string> = {
    websites: '網站',
    edmCampaigns: 'EDM 活動',
    suppliers: '供應商',
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-teal-600" />
          <h3 className="text-[14px] font-semibold text-[#0d1a2d]">模擬數據管理</h3>
          <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-medium rounded">
            {SAMPLE_BADGE_TEXT}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span>模擬: <strong className="text-amber-600">{totalSample}</strong></span>
          <span>·</span>
          <span>真實: <strong className="text-teal-600">{totalReal}</strong></span>
        </div>
      </div>

      {/* Description */}
      <div className="p-3 bg-blue-50 border border-blue-100 rounded-md text-[12px] text-blue-800 leading-relaxed">
        <p className="font-medium mb-1">📋 關於模擬數據</p>
        <p>系統中的所有演示數據均帶有 <code className="bg-blue-100 px-1 rounded text-[11px]">模擬數據</code> 標記。
          當您準備投入真實數據時，可以：</p>
        <ul className="list-disc list-inside mt-1 space-y-0.5">
          <li><strong>隱藏</strong> — 暫時隱藏模擬數據（數據仍保留在系統中）</li>
          <li><strong>清除</strong> — 永久刪除所有模擬數據（不影響真實數據）</li>
          <li><strong>還原</strong> — 重新載入模擬數據（如需再次查看）</li>
        </ul>
        <p className="mt-1.5 text-blue-600 text-[11px]">⚠️ 「員工列表」資料來源為 Bubble.io API，不受模擬數據管理影響。</p>
      </div>

      {/* Toggle */}
      <div className="flex items-center justify-between p-3 bg-white border rounded-md">
        <div className="flex items-center gap-2">
          {sampleDataEnabled ? (
            <Eye className="w-4 h-4 text-amber-600" />
          ) : (
            <EyeOff className="w-4 h-4 text-slate-400" />
          )}
          <div>
            <p className="text-[13px] font-medium">顯示模擬數據</p>
            <p className="text-[11px] text-muted-foreground">
              {sampleDataEnabled ? '模擬數據正在顯示中' : '模擬數據已隱藏'}
            </p>
          </div>
        </div>
        <button
          onClick={() => setSampleDataEnabled(!sampleDataEnabled)}
          className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${
            sampleDataEnabled ? 'bg-amber-500' : 'bg-slate-300'
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
              sampleDataEnabled ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {/* Breakdown table */}
      <div className="border rounded-md overflow-hidden">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="bg-muted/50 border-b">
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">模組</th>
              <th className="text-center px-3 py-2 font-medium text-amber-600">模擬數據</th>
              <th className="text-center px-3 py-2 font-medium text-teal-600">真實數據</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(breakdown).map(([key, { sample, real }]) => (
              <tr key={key} className="border-b last:border-b-0 hover:bg-muted/30 transition-colors">
                <td className="px-3 py-1.5">{moduleLabels[key] || key}</td>
                <td className="text-center px-3 py-1.5">
                  {sample > 0 ? (
                    <span className="inline-flex items-center px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[11px] font-medium">
                      {sample}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">0</span>
                  )}
                </td>
                <td className="text-center px-3 py-1.5">
                  {real > 0 ? (
                    <span className="inline-flex items-center px-1.5 py-0.5 bg-teal-100 text-teal-700 rounded text-[11px] font-medium">
                      {real}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">0</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-muted/50 font-medium">
              <td className="px-3 py-2">合計</td>
              <td className="text-center px-3 py-2 text-amber-600">{totalSample}</td>
              <td className="text-center px-3 py-2 text-teal-600">{totalReal}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        {/* Clear */}
        {totalSample > 0 && !showConfirmClear && (
          <button
            onClick={() => setShowConfirmClear(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-md transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            清除所有模擬數據
          </button>
        )}

        {/* Restore */}
        {totalSample === 0 && !showConfirmRestore && (
          <button
            onClick={() => setShowConfirmRestore(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-md transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            還原模擬數據
          </button>
        )}

        {totalSample === 0 && totalReal === 0 && (
          <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
            <CheckCircle2 className="w-3.5 h-3.5 text-teal-500" />
            系統已準備好接收真實數據
          </div>
        )}
      </div>

      {/* Confirm Clear Dialog */}
      {showConfirmClear && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-md space-y-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-[13px] font-medium text-rose-800">確認清除所有模擬數據？</p>
              <p className="text-[11px] text-rose-700 mt-0.5">
                此操作將永久刪除所有 {totalSample} 條模擬記錄。真實數據和系統設定不受影響。
                您可以隨時使用「還原」功能重新載入模擬數據。
              </p>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowConfirmClear(false)}
              className="px-3 py-1.5 text-[12px] bg-white border rounded hover:bg-muted/50 transition-colors"
            >
              取消
            </button>
            <button
              onClick={() => {
                clearAllSampleData();
                setShowConfirmClear(false);
              }}
              className="px-3 py-1.5 text-[12px] font-medium text-white bg-rose-600 rounded hover:bg-rose-700 transition-colors"
            >
              確認清除
            </button>
          </div>
        </div>
      )}

      {/* Confirm Restore Dialog */}
      {showConfirmRestore && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-md space-y-2">
          <div className="flex items-start gap-2">
            <RotateCcw className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-[13px] font-medium text-blue-800">確認還原模擬數據？</p>
              <p className="text-[11px] text-blue-700 mt-0.5">
                此操作將重新載入所有模擬數據。您已新增的真實數據不會被覆蓋。
              </p>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowConfirmRestore(false)}
              className="px-3 py-1.5 text-[12px] bg-white border rounded hover:bg-muted/50 transition-colors"
            >
              取消
            </button>
            <button
              onClick={() => {
                restoreSampleData();
                setShowConfirmRestore(false);
              }}
              className="px-3 py-1.5 text-[12px] font-medium text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors"
            >
              確認還原
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * SampleDataBadge — Small inline badge to mark items as sample data
 * Usage: <SampleDataBadge /> next to any item title
 */
export function SampleDataBadge({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-medium rounded leading-none ${className}`}>
      {SAMPLE_BADGE_TEXT}
    </span>
  );
}

/**
 * SampleDataIndicator — Fixed indicator in the corner showing sample data mode
 * Place this in the global layout
 */
export function SampleDataIndicator() {
  const { sampleDataEnabled, setSampleDataEnabled, sampleDataSummary } = useDataStore();
  const { totalSample } = sampleDataSummary;

  if (totalSample === 0) return null;

  return (
    <button
      onClick={() => setSampleDataEnabled(!sampleDataEnabled)}
      className={`fixed bottom-4 right-4 z-50 flex items-center gap-1.5 px-3 py-1.5 rounded-full shadow-lg text-[11px] font-medium transition-all duration-200 hover:scale-105 ${
        sampleDataEnabled
          ? 'bg-amber-500 text-white hover:bg-amber-600'
          : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
      }`}
      title={sampleDataEnabled ? '點擊隱藏模擬數據' : '點擊顯示模擬數據'}
    >
      {sampleDataEnabled ? (
        <>
          <Database className="w-3 h-3" />
          模擬數據: 顯示中 ({totalSample})
        </>
      ) : (
        <>
          <EyeOff className="w-3 h-3" />
          模擬數據: 已隱藏
        </>
      )}
    </button>
  );
}
