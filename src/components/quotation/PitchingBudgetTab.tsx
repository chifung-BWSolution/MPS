import { useMemo, useState } from 'react';
import {
  DollarSign,
  BarChart3,
  TrendingUp,
  PieChart as PieChartIcon,
  Pencil,
  Plus,
  Trash2,
  CheckCircle2,
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { cn } from '@/lib/utils';
import { CrudModal } from '@/components/ui/crud-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PITCHING_CURRENCY, type PitchingExpenseItem } from '@/data/pitchingData';

function formatMoney(amount: number, currency = PITCHING_CURRENCY) {
  return `$${amount.toLocaleString('en-US', { maximumFractionDigits: 0 })} ${currency}`;
}

function totalExpenses(expenses: PitchingExpenseItem[]) {
  return expenses.reduce((sum, item) => sum + item.amount, 0);
}

export function PitchingBudgetTab({
  income,
  expenses,
  onIncomeChange,
  onExpensesChange,
}: {
  income: number | undefined;
  expenses: PitchingExpenseItem[];
  onIncomeChange: (income: number | undefined) => void;
  onExpensesChange: (next: PitchingExpenseItem[]) => void;
}) {
  const [showIncomeModal, setShowIncomeModal] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [incomeDraft, setIncomeDraft] = useState('');
  const [expenseDraft, setExpenseDraft] = useState({ name: '', amount: '', notes: '' });

  const expenseTotal = useMemo(() => totalExpenses(expenses), [expenses]);
  const incomeValue = income ?? 0;
  const grossProfit = Math.max(incomeValue - expenseTotal, 0);
  const marginPercent = incomeValue > 0 ? (grossProfit / incomeValue) * 100 : 0;
  const expenseRatio = incomeValue > 0 ? (expenseTotal / incomeValue) * 100 : 0;
  const isHealthy = marginPercent >= 30;

  const pieData = useMemo(() => {
    if (incomeValue <= 0) return [];
    if (expenseTotal <= 0) {
      return [{ name: '毛利 Gross Profit', value: incomeValue, color: '#22c55e' }];
    }
    return [
      { name: '支出 Expense', value: expenseTotal, color: '#f59e0b' },
      { name: '毛利 Gross Profit', value: grossProfit, color: '#22c55e' },
    ].filter((d) => d.value > 0);
  }, [incomeValue, expenseTotal, grossProfit]);

  const openIncomeModal = () => {
    setIncomeDraft(income != null ? String(income) : '');
    setShowIncomeModal(true);
  };

  const saveIncome = () => {
    const parsed = parseFloat(incomeDraft);
    onIncomeChange(Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined);
    setShowIncomeModal(false);
  };

  const openExpenseModal = () => {
    setExpenseDraft({ name: '', amount: '', notes: '' });
    setShowExpenseModal(true);
  };

  const saveExpense = () => {
    const amount = parseFloat(expenseDraft.amount);
    if (!expenseDraft.name.trim() || !Number.isFinite(amount) || amount < 0) return;
    onExpensesChange([
      ...expenses,
      {
        id: `exp_${Date.now()}`,
        name: expenseDraft.name.trim(),
        amount,
        currency: PITCHING_CURRENCY,
        notes: expenseDraft.notes.trim() || undefined,
      },
    ]);
    setShowExpenseModal(false);
  };

  const removeExpense = (id: string) => {
    onExpensesChange(expenses.filter((item) => item.id !== id));
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Estimated Income */}
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-md bg-blue-50 flex items-center justify-center">
                <DollarSign size={16} className="text-blue-600" />
              </div>
              <div>
                <h3 className="text-[14px] font-semibold">預計收入 Estimated Income</h3>
              </div>
            </div>
            <button
              type="button"
              onClick={openIncomeModal}
              className="flex items-center gap-1 text-[12px] text-muted-foreground hover:text-teal-600 transition-colors"
            >
              <Pencil size={13} /> 編輯
            </button>
          </div>
          <p className="text-[28px] font-bold tracking-tight">
            {income != null ? formatMoney(income) : '—'}
          </p>
        </div>

        {/* Estimated Expense */}
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-md bg-amber-50 flex items-center justify-center">
                <BarChart3 size={16} className="text-amber-600" />
              </div>
              <div className="flex items-center gap-2">
                <h3 className="text-[14px] font-semibold">預計支出 Estimated Expense</h3>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                  {expenses.length} 項
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={openExpenseModal}
              className="flex items-center gap-1 px-3 py-1.5 bg-teal-600 text-white rounded-md text-[12px] font-medium hover:bg-teal-700 transition-colors"
            >
              <Plus size={13} /> 新增費用
            </button>
          </div>

          {expenses.length === 0 ? (
            <div className="py-10 text-center">
              <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-3">
                <DollarSign size={20} className="text-muted-foreground/60" />
              </div>
              <p className="text-[13px] text-muted-foreground">尚無費用項目</p>
              <p className="text-[12px] text-muted-foreground/70 mt-1">
                點擊「新增費用」添加第一筆預計支出
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {expenses.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium truncate">{item.name}</p>
                    {item.notes && (
                      <p className="text-[11px] text-muted-foreground truncate mt-0.5">{item.notes}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[13px] font-semibold tabular-nums">
                      {formatMoney(item.amount)}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeExpense(item.id)}
                      className="p-1 rounded hover:bg-rose-50 text-muted-foreground hover:text-rose-600 transition-colors"
                      title="刪除"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
              <p className="text-[12px] text-muted-foreground text-right pt-1">
                合計 {formatMoney(expenseTotal)}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Gross Profit */}
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp size={16} className="text-emerald-600" />
            <h3 className="text-[13px] font-semibold">毛利 Gross Profit &amp; Margin</h3>
          </div>
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-[24px] font-bold text-emerald-600 tabular-nums">
              {formatMoney(grossProfit).replace(` ${PITCHING_CURRENCY}`, '')}
            </span>
            <span className="text-[18px] font-semibold text-emerald-600 tabular-nums">
              {incomeValue > 0 ? `${marginPercent.toFixed(1)}%` : '—'}
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground mb-3">收入 − 支出 = 毛利</p>
          <div className="h-2 rounded-full bg-muted overflow-hidden mb-3">
            <div
              className={cn('h-full rounded-full transition-all', isHealthy ? 'bg-emerald-500' : 'bg-amber-500')}
              style={{ width: `${Math.min(Math.max(marginPercent, 0), 100)}%` }}
            />
          </div>
          {incomeValue > 0 && (
            <p className={cn('text-[12px] flex items-center gap-1', isHealthy ? 'text-emerald-600' : 'text-amber-600')}>
              <CheckCircle2 size={13} />
              {isHealthy ? '健康水平' : '毛利偏低'}
            </p>
          )}
          <div className="mt-4 pt-3 border-t border-border/60 space-y-1 text-[12px]">
            <div className="flex justify-between">
              <span className="text-muted-foreground">收入</span>
              <span className="tabular-nums">{income != null ? formatMoney(incomeValue) : '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">支出</span>
              <span className="tabular-nums">{expenseTotal > 0 ? formatMoney(expenseTotal) : '—'}</span>
            </div>
            <div className="flex justify-between font-medium">
              <span>淨額</span>
              <span className="text-emerald-600 tabular-nums">{formatMoney(grossProfit)}</span>
            </div>
          </div>
        </div>

        {/* Income Composition */}
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5">
          <div className="flex items-center gap-2 mb-1">
            <PieChartIcon size={16} className="text-blue-600" />
            <h3 className="text-[13px] font-semibold">收入結構 Income Composition</h3>
          </div>
          <p className="text-[11px] text-muted-foreground mb-3">
            整個餅圖 = 預計收入 {income != null ? formatMoney(incomeValue) : '—'}
          </p>
          {pieData.length > 0 ? (
            <>
              <div className="h-[140px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={42}
                      outerRadius={62}
                      paddingAngle={2}
                    >
                      {pieData.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap gap-3 mt-2">
                {pieData.map((entry) => (
                  <div key={entry.name} className="flex items-center gap-1.5 text-[11px]">
                    <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: entry.color }} />
                    {entry.name}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="h-[140px] flex items-center justify-center text-[12px] text-muted-foreground">
              請先設定預計收入
            </div>
          )}
        </div>

        {/* Expense Ratio */}
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 size={16} className="text-violet-600" />
            <h3 className="text-[13px] font-semibold">支出佔收入 Expense Ratio</h3>
          </div>
          <p className="text-[28px] font-bold text-violet-600 tabular-nums mb-4">
            {incomeValue > 0 ? `${expenseRatio.toFixed(1)}%` : '—'}
          </p>
          <div className="space-y-1 text-[12px] pt-3 border-t border-border/60">
            <div className="flex justify-between">
              <span className="text-muted-foreground">收入</span>
              <span className="tabular-nums">{income != null ? formatMoney(incomeValue) : '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">支出</span>
              <span className="tabular-nums">{expenseTotal > 0 ? formatMoney(expenseTotal) : '—'}</span>
            </div>
            <div className="flex justify-between font-medium">
              <span>淨額</span>
              <span className="text-emerald-600 tabular-nums">{formatMoney(grossProfit)}</span>
            </div>
          </div>
        </div>
      </div>

      <CrudModal isOpen={showIncomeModal} onClose={() => setShowIncomeModal(false)} title="編輯預計收入" size="sm">
        <div className="space-y-4">
          <div>
            <Label className="text-[12px]">金額（{PITCHING_CURRENCY}）</Label>
            <Input
              type="number"
              min="0"
              step="1"
              value={incomeDraft}
              onChange={(e) => setIncomeDraft(e.target.value)}
              placeholder="20000"
              className="mt-1 h-9 text-[13px]"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowIncomeModal(false)}>
              取消
            </Button>
            <Button className="bg-teal-600 hover:bg-teal-700 text-white" onClick={saveIncome}>
              確認
            </Button>
          </div>
        </div>
      </CrudModal>

      <CrudModal isOpen={showExpenseModal} onClose={() => setShowExpenseModal(false)} title="新增費用" size="sm">
        <div className="space-y-4">
          <div>
            <Label className="text-[12px]">費用名稱</Label>
            <Input
              value={expenseDraft.name}
              onChange={(e) => setExpenseDraft((p) => ({ ...p, name: e.target.value }))}
              placeholder="例如：設計外包"
              className="mt-1 h-9 text-[13px]"
            />
          </div>
          <div>
            <Label className="text-[12px]">金額（{PITCHING_CURRENCY}）</Label>
            <Input
              type="number"
              min="0"
              step="1"
              value={expenseDraft.amount}
              onChange={(e) => setExpenseDraft((p) => ({ ...p, amount: e.target.value }))}
              placeholder="5000"
              className="mt-1 h-9 text-[13px]"
            />
          </div>
          <div>
            <Label className="text-[12px]">備註（選填）</Label>
            <Input
              value={expenseDraft.notes}
              onChange={(e) => setExpenseDraft((p) => ({ ...p, notes: e.target.value }))}
              className="mt-1 h-9 text-[13px]"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowExpenseModal(false)}>
              取消
            </Button>
            <Button
              className="bg-teal-600 hover:bg-teal-700 text-white"
              onClick={saveExpense}
              disabled={!expenseDraft.name.trim() || !expenseDraft.amount}
            >
              新增
            </Button>
          </div>
        </div>
      </CrudModal>
    </div>
  );
}
