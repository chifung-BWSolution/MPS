import { lazy, Suspense, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { useAuth } from '@/context/AuthContext';
import { useActiveStaffOptions } from '@/hooks/useActiveStaffOptions';
import { useQuotationClientList } from '@/hooks/useQuotationClientList';
import { useQuotationClientProjects } from '@/hooks/useQuotationClientProjects';
import { toQuotationClientSelectOption } from '@/data/quotationClientList';
import { toClientProjectSelectOptions } from '@/lib/websiteClientProjectLink';
import type { PitchingFormValues } from '@/components/quotation/PitchingModule';

const PitchingFormModal = lazy(async () => {
  const mod = await import('@/components/quotation/PitchingModule');
  return { default: mod.PitchingFormModal };
});

export function WebsiteClientProjectSelectField({
  value,
  onChange,
  websiteName,
  disabled = false,
}: {
  value: string;
  onChange: (quotationClientProjectId: string) => void;
  websiteName?: string;
  disabled?: boolean;
}) {
  const { systemUser } = useAuth();
  const { records, addRecord } = useQuotationClientProjects();
  const { records: clientListRecords, addClient } = useQuotationClientList();
  const { options: staffOptions } = useActiveStaffOptions([systemUser?.staff_id]);
  const [showQuickAdd, setShowQuickAdd] = useState(false);

  const options = useMemo(() => toClientProjectSelectOptions(records), [records]);
  const clientOptions = useMemo(
    () => clientListRecords.map(toQuotationClientSelectOption),
    [clientListRecords],
  );
  const selected = records.find((record) => record.id === value);

  const handleQuickAdd = async (form: PitchingFormValues) => {
    const selectedStaff = staffOptions.find((staff) => staff.value === form.mainPmId);
    const { data, error } = await addRecord({
      clientId: form.clientId.trim(),
      clientName: form.clientName.trim(),
      displayName: form.displayName.trim(),
      inquiryDate: form.inquiryDate,
      signedDate: form.signedDate || undefined,
      handoverDate: form.handoverDate || undefined,
      description: form.description.trim() || undefined,
      projectTypes: form.projectTypes,
      assignedPm: '',
      assignedPmName: selectedStaff?.label || '',
      mainPmId: form.mainPmId.trim() || undefined,
      mainPmName: selectedStaff?.label || undefined,
      status: 'initial',
      asanaLink: form.asanaLink.trim() || undefined,
    });
    if (error || !data) {
      toast.error('新增失敗', { description: error?.message });
      return;
    }
    toast.success('客戶項目已新增');
    onChange(data.id);
    setShowQuickAdd(false);
  };

  return (
    <>
      <div>
        <label className="text-[12px] font-medium text-muted-foreground block mb-1">客戶項目</label>
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <SearchableSelect
              value={value}
              onValueChange={onChange}
              options={options}
              placeholder="搜尋客戶項目..."
              searchPlaceholder="搜尋項目或客戶名稱..."
              emptyText="找不到客戶項目"
              disabled={disabled}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowQuickAdd(true)}
            disabled={disabled}
            className="h-9 shrink-0 gap-1.5 text-[13px] border-teal-200 text-teal-700 bg-teal-50 hover:bg-teal-100"
          >
            <Plus size={14} /> 新增客戶項目
          </Button>
        </div>
        {selected?.clientName && selected.clientName !== '—' && (
          <p className="text-[11px] text-muted-foreground mt-1 truncate">{selected.clientName}</p>
        )}
      </div>
      {showQuickAdd && (
        <Suspense fallback={null}>
          <PitchingFormModal
            isOpen
            hideWebsiteField
            onClose={() => setShowQuickAdd(false)}
            onSubmit={handleQuickAdd}
            clientOptions={clientOptions}
            staffOptions={staffOptions}
            defaultMainPmId={systemUser?.staff_id}
            defaultValues={websiteName?.trim() ? { displayName: websiteName.trim() } : undefined}
            createTitle="新增客戶項目"
            onCreateClient={addClient}
          />
        </Suspense>
      )}
    </>
  );
}
