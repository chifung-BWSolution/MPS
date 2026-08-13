import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CrudModal } from '@/components/ui/crud-modal';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { adsTagColorClass } from '@/types/adsTags';
import type { AdsTag } from '@/types/adsTags';
import { cn } from '@/lib/utils';

type CampaignInfo = {
  id: string;
  campaignName: string;
  accountLabel?: string;
  campaignId?: string;
};

export function AdsCampaignTagsModal({
  campaign,
  allTags,
  assignedTags,
  saving,
  onClose,
  onSave,
}: {
  campaign: CampaignInfo | null;
  allTags: AdsTag[];
  assignedTags: AdsTag[];
  saving: boolean;
  onClose: () => void;
  onSave: (tagIds: string[]) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const assignedIdsKey = assignedTags.map((tag) => tag.id).sort().join(',');
  const campaignId = campaign?.id ?? null;

  useEffect(() => {
    if (!campaignId) return;
    setSelected(new Set(assignedIdsKey ? assignedIdsKey.split(',') : []));
  }, [campaignId, assignedIdsKey]);

  const selectableTags = useMemo(() => {
    const assignedIds = new Set(assignedTags.map((tag) => tag.id));
    return allTags.filter((tag) => tag.isActive || assignedIds.has(tag.id));
  }, [allTags, assignedTags]);

  const toggle = (tagId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(tagId)) next.delete(tagId);
      else next.add(tagId);
      return next;
    });
  };

  const handleSave = async () => {
    const result = await onSave([...selected]);
    if (!result.ok) {
      toast.error('更新標籤失敗', { description: result.error });
      return;
    }
    toast.success('已更新 Campaign 標籤');
    onClose();
  };

  return (
    <CrudModal
      isOpen={!!campaign}
      onClose={() => !saving && onClose()}
      title="設定 Campaign 標籤"
      size="sm"
    >
      {campaign ? (
        <div className="space-y-4">
          <div>
            <div className="text-[12px] text-muted-foreground mb-1">Campaign</div>
            <div className="text-[14px] font-medium">{campaign.campaignName}</div>
            {(campaign.accountLabel || campaign.campaignId) && (
              <div className="text-[11px] text-muted-foreground mt-0.5">
                {[campaign.accountLabel, campaign.campaignId].filter(Boolean).join(' · ')}
              </div>
            )}
          </div>

          {selectableTags.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">
              尚無可用標籤。請先到「行銷管理 → 廣告標籤」新增並啟用標籤。
            </p>
          ) : (
            <div className="space-y-1.5 max-h-[320px] overflow-y-auto pr-1">
              {selectableTags.map((tag) => {
                const checked = selected.has(tag.id);
                return (
                  <label
                    key={tag.id}
                    className={cn(
                      'flex items-center gap-2.5 rounded-md border px-2.5 py-2 cursor-pointer transition-colors',
                      checked ? 'border-teal-200 bg-teal-50/60' : 'border-border hover:bg-muted/40',
                    )}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggle(tag.id)}
                      disabled={saving}
                    />
                    <span
                      className={cn(
                        'inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-medium',
                        adsTagColorClass(tag.color),
                      )}
                    >
                      {tag.name}
                    </span>
                    {!tag.isActive ? (
                      <span className="text-[11px] text-amber-700">已停用</span>
                    ) : null}
                  </label>
                );
              })}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="secondary" disabled={saving} onClick={onClose}>
              取消
            </Button>
            <Button
              className="bg-teal-600 hover:bg-teal-700 text-white"
              disabled={saving}
              onClick={() => void handleSave()}
            >
              {saving ? '儲存中…' : '儲存'}
            </Button>
          </div>
        </div>
      ) : null}
    </CrudModal>
  );
}
