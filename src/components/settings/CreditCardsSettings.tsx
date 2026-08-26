import { useMemo, useState } from 'react';
import { CreditCard, Edit, Plus, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useCompanies } from '@/hooks/useCompanies';
import { useActiveStaffOptions } from '@/hooks/useActiveStaffOptions';
import { useCreditCards } from '@/hooks/useCreditCards';
import {
  CREDIT_CARD_BANKS,
  CREDIT_CARD_MONTHS,
  creditCardYearOptions,
  formatCompanyOptionLabel,
  isCardExpiringSoon,
  isValidExpiry,
  isValidLastFour,
  joinExpiry,
  normalizeLastFour,
  splitExpiry,
  type CreditCardInput,
  type CreditCardRecord,
} from '@/lib/creditCards';
import { CrudModal, CrudModalFooter, DeleteConfirmModal } from '@/components/ui/crud-modal';
import { SearchableSelect } from '@/components/ui/searchable-select';
import type { Company } from '@/types/app';

type Draft = {
  companyListId: string;
  lastFour: string;
  bank: string;
  purpose: string;
  holder: string;
  custodianId: string;
  expiryYear: string;
  expiryMonth: string;
};

const emptyDraft = (): Draft => ({
  companyListId: '',
  lastFour: '',
  bank: '',
  purpose: '',
  holder: '',
  custodianId: '',
  expiryYear: '',
  expiryMonth: '',
});

function companyKey(company: Company) {
  return company.uuid || company.id;
}

function toInput(draft: Draft): CreditCardInput {
  return {
    companyListId: draft.companyListId,
    lastFour: draft.lastFour,
    bank: draft.bank,
    purpose: draft.purpose,
    holder: draft.holder,
    custodianId: draft.custodianId || null,
    expiry: joinExpiry(draft.expiryYear, draft.expiryMonth),
  };
}

export function CreditCardsSettings() {
  const { cards, loading, error, addCard, updateCard, deleteCard } = useCreditCards();
  const { companies, loading: companiesLoading } = useCompanies();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<CreditCardRecord | null>(null);
  const [deletingCard, setDeletingCard] = useState<CreditCardRecord | null>(null);
  const [saving, setSaving] = useState(false);

  const handleAdd = () => {
    setEditingCard(null);
    setIsModalOpen(true);
  };

  const handleEdit = (card: CreditCardRecord) => {
    setEditingCard(card);
    setIsModalOpen(true);
  };

  const handleSave = async (draft: Draft) => {
    setSaving(true);
    const result = editingCard
      ? await updateCard(editingCard.id, toInput(draft))
      : await addCard(toInput(draft));
    setSaving(false);
    if (result.error) {
      toast.error(editingCard ? '儲存失敗' : '新增失敗', { description: result.error.message });
      return;
    }
    toast.success(editingCard ? '信用卡已更新' : '信用卡已新增');
    setIsModalOpen(false);
    setEditingCard(null);
  };

  const handleConfirmDelete = async () => {
    if (!deletingCard) return;
    const { error: err } = await deleteCard(deletingCard.id);
    if (err) {
      toast.error('刪除失敗', { description: err.message });
      return;
    }
    toast.success('信用卡已刪除');
    setDeletingCard(null);
  };

  if (loading || companiesLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-[13px] text-muted-foreground gap-2">
        <span className="animate-spin inline-block w-4 h-4 border-2 border-teal-600 border-t-transparent rounded-full" />
        從資料庫載入中…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-[18px] font-bold">付款信用卡</h3>
        <button
          type="button"
          onClick={handleAdd}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded-md text-[12px] font-medium hover:bg-teal-700 transition-colors duration-200"
        >
          <Plus size={12} /> 新增信用卡
        </button>
      </div>

      {error && (
        <p className="text-[12px] text-rose-600 bg-rose-50 border border-rose-200 rounded-md px-3 py-2">
          無法載入信用卡：{error}
        </p>
      )}

      {cards.length === 0 ? (
        <div className="border border-dashed border-border rounded-md py-12 text-center text-[13px] text-muted-foreground">
          尚未新增信用卡
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {cards.map((card) => {
            const company = companies.find((c) => companyKey(c) === card.companyListId);
            const companyName = company
              ? company.companyNameEn || company.companyNameZh || company.companyCode
              : card.companyName || '—';
            const expiringSoon = isCardExpiringSoon(card.expiry);
            return (
              <div
                key={card.id}
                className={cn(
                  'border rounded-md p-4 relative group',
                  expiringSoon ? 'border-amber-300 bg-amber-50/30' : 'border-border/50',
                )}
              >
                <div className="absolute top-3 right-3 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={() => handleEdit(card)}
                    className="text-teal-600 hover:text-teal-700 p-1 rounded hover:bg-teal-50"
                  >
                    <Edit size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeletingCard(card)}
                    className="text-muted-foreground hover:text-rose-500 p-1 rounded hover:bg-rose-50"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <CreditCard size={16} className="text-muted-foreground" />
                    <span className="text-[14px] font-bold">•••• {card.lastFour}</span>
                  </div>
                  {expiringSoon && (
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-amber-100 text-amber-700">即將到期</span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 text-[12px]">
                  <div>
                    <span className="text-muted-foreground">公司：</span>
                    <span>{companyName}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">銀行：</span>
                    <span>{card.bank}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">用途：</span>
                    <span>{card.purpose || '—'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">到期：</span>
                    <span className={expiringSoon ? 'text-amber-600 font-medium' : ''}>{card.expiry}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">卡主：</span>
                    <span>{card.holder || '—'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">保管人：</span>
                    <span>{card.custodianName || '—'}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {isModalOpen && (
        <CreditCardFormModal
          card={editingCard}
          companies={companies}
          saving={saving}
          onSave={handleSave}
          onClose={() => {
            if (saving) return;
            setIsModalOpen(false);
            setEditingCard(null);
          }}
        />
      )}

      <DeleteConfirmModal
        isOpen={Boolean(deletingCard)}
        onClose={() => setDeletingCard(null)}
        onConfirm={() => void handleConfirmDelete()}
        itemName={deletingCard ? `•••• ${deletingCard.lastFour}` : ''}
        canDelete
        description={
          deletingCard
            ? `確定要刪除末四位 •••• ${deletingCard.lastFour} 的信用卡嗎？此操作無法撤銷。`
            : undefined
        }
      />
    </div>
  );
}

function CreditCardFormModal({
  card,
  companies,
  saving,
  onSave,
  onClose,
}: {
  card: CreditCardRecord | null;
  companies: Company[];
  saving: boolean;
  onSave: (draft: Draft) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => {
    if (!card) return emptyDraft();
    const expiry = splitExpiry(card.expiry);
    return {
      companyListId: card.companyListId,
      lastFour: card.lastFour,
      bank: card.bank,
      purpose: card.purpose,
      holder: card.holder,
      custodianId: card.custodianId || '',
      expiryYear: expiry.year,
      expiryMonth: expiry.month,
    };
  });
  const { options: staffOptions } = useActiveStaffOptions();
  const activeStaffOptions = useMemo(
    () => staffOptions.filter((option) => option.status.toLowerCase() === 'active'),
    [staffOptions],
  );
  const yearOptions = useMemo(
    () => creditCardYearOptions(new Date(), draft.expiryYear),
    [draft.expiryYear],
  );

  const companyOptions = useMemo(() => {
    return companies.filter((company) => {
      const id = companyKey(company);
      if (!id) return false;
      return company.isActive || id === draft.companyListId;
    });
  }, [companies, draft.companyListId]);

  const canSave =
    Boolean(draft.companyListId) &&
    isValidLastFour(draft.lastFour) &&
    Boolean(draft.bank) &&
    isValidExpiry(joinExpiry(draft.expiryYear, draft.expiryMonth));

  return (
    <CrudModal
      isOpen
      onClose={onClose}
      title={card ? '編輯信用卡' : '新增信用卡'}
      size="md"
      footer={
        <CrudModalFooter className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-border rounded-md text-[13px] font-medium hover:bg-muted/50 transition-colors duration-200"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => onSave(draft)}
            disabled={!canSave || saving}
            className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white rounded-md text-[13px] font-medium hover:bg-teal-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save size={13} /> {saving ? '儲存中…' : card ? '儲存' : '新增'}
          </button>
        </CrudModalFooter>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1.5">所屬公司 *</label>
            <select
              className="w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600 bg-white"
              value={draft.companyListId}
              onChange={(e) => setDraft({ ...draft, companyListId: e.target.value })}
            >
              <option value="">選擇公司</option>
              {companyOptions.map((company) => {
                const id = companyKey(company);
                return (
                  <option key={id} value={id}>
                    {formatCompanyOptionLabel(company)}
                  </option>
                );
              })}
            </select>
          </div>
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1.5">銀行 *</label>
            <select
              className="w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600 bg-white"
              value={draft.bank}
              onChange={(e) => setDraft({ ...draft, bank: e.target.value })}
            >
              <option value="">選擇銀行</option>
              {CREDIT_CARD_BANKS.map((bank) => (
                <option key={bank} value={bank}>
                  {bank}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1.5">卡號末四位 *</label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={4}
              className="w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600 bg-white"
              value={draft.lastFour}
              onChange={(e) => setDraft({ ...draft, lastFour: normalizeLastFour(e.target.value) })}
              placeholder="0000"
            />
          </div>
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1.5">到期日 *</label>
            <div className="grid grid-cols-2 gap-2">
              <select
                className="w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600 bg-white"
                value={draft.expiryYear}
                onChange={(e) => setDraft({ ...draft, expiryYear: e.target.value })}
              >
                <option value="">年</option>
                {yearOptions.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
              <select
                className="w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600 bg-white"
                value={draft.expiryMonth}
                onChange={(e) => setDraft({ ...draft, expiryMonth: e.target.value })}
              >
                <option value="">月</option>
                {CREDIT_CARD_MONTHS.map((month) => (
                  <option key={month} value={month}>
                    {month}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
        <div>
          <label className="text-[12px] font-medium text-muted-foreground block mb-1.5">用途</label>
          <input
            className="w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600 bg-white"
            value={draft.purpose}
            onChange={(e) => setDraft({ ...draft, purpose: e.target.value })}
            placeholder="例：廣告投放、工具訂閱"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1.5">卡主</label>
            <input
              className="w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600 bg-white"
              value={draft.holder}
              onChange={(e) => setDraft({ ...draft, holder: e.target.value })}
              placeholder="持卡人名稱"
            />
          </div>
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1.5">保管人</label>
            <SearchableSelect
              value={draft.custodianId}
              onValueChange={(custodianId) => setDraft({ ...draft, custodianId })}
              options={[{ value: '', label: '（未指定）' }, ...activeStaffOptions]}
              placeholder="選擇保管人"
              searchPlaceholder="搜尋姓名或電郵..."
              emptyText="沒有可選同事"
            />
          </div>
        </div>
      </div>
    </CrudModal>
  );
}
