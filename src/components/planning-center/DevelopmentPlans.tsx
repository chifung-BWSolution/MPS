import { useMemo, useState } from 'react';
import { ArrowLeft, ExternalLink, Eye, FileText, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useDevelopmentPlans, type DevelopmentPlan } from '@/hooks/useDevelopmentPlans';

function DevelopmentPlanViewer({
  plan,
  onBack,
}: {
  plan: DevelopmentPlan;
  onBack: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors duration-200"
        >
          <ArrowLeft size={14} />
          返回開發計劃列表
        </button>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 text-[12px]"
          asChild
        >
          <a href={plan.documentUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={12} />
            新分頁打開
          </a>
        </Button>
      </div>

      <div>
        <h1 className="text-xl font-bold text-[#0d1a2d]">{plan.title}</h1>
        <div className="flex flex-wrap items-center gap-2 mt-2 text-sm text-muted-foreground">
          <span>規劃日期：{plan.planningDate}</span>
          <span>•</span>
          <span>負責人：{plan.owner}</span>
        </div>
      </div>

      <div className="rounded-lg border border-border overflow-hidden bg-white shadow-sm">
        <iframe
          title={plan.title}
          src={plan.documentUrl}
          className="w-full border-0"
          style={{ height: 'calc(100vh - 220px)', minHeight: 640 }}
        />
      </div>
    </div>
  );
}

export function DevelopmentPlans() {
  const { plans, loading, error } = useDevelopmentPlans();
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);

  const selectedPlan = useMemo(
    () => plans.find((plan) => plan.id === selectedPlanId) ?? null,
    [plans, selectedPlanId],
  );

  if (selectedPlan) {
    return (
      <DevelopmentPlanViewer
        plan={selectedPlan}
        onBack={() => setSelectedPlanId(null)}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[#0d1a2d]">開發計劃</h1>
        <p className="text-sm text-muted-foreground mt-1">
          查看系統功能開發方案與業務邏輯文檔
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 size={20} className="animate-spin mr-2" />
          載入中…
        </div>
      ) : error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">
          無法載入開發計劃列表：{error}
        </div>
      ) : plans.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-white p-12 text-center">
          <FileText size={32} className="mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground">暫無開發計劃文檔</p>
          <p className="text-xs text-muted-foreground mt-2">
            請參考 docs/06-development_plan.md 發佈文檔
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-white overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/80">
                <TableHead className="w-[140px]">規劃日期</TableHead>
                <TableHead>內容標題</TableHead>
                <TableHead className="w-[120px]">負責人</TableHead>
                <TableHead className="w-[100px] text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {plans.map((plan) => (
                <TableRow key={plan.id} className="hover:bg-slate-50/50">
                  <TableCell className="text-sm text-muted-foreground">
                    {plan.planningDate}
                  </TableCell>
                  <TableCell>
                    <span className="text-sm font-medium text-[#0d1a2d]">
                      {plan.title}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {plan.owner}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1 text-[12px] text-teal-700 border-teal-200 hover:bg-teal-50"
                      onClick={() => setSelectedPlanId(plan.id)}
                    >
                      <Eye size={12} />
                      查看
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
