import { WebPageSupplierModule } from './WebPageSupplierModule';
import { SupplierTypesSettings } from './SupplierTypesSettings';

export function SupplierModule({ subModule }: { subModule?: string }) {
  const active = subModule || 'web-suppliers';

  const getTitle = () => {
    switch (active) {
      case 'supplier-types':
        return {
          title: '供應商類型',
          subtitle: '管理供應商類型分類與顯示名稱，供供應商名單與支出選用。',
        };
      default:
        return {
          title: '網頁供應商',
          subtitle: '管理可購買反向連結的網站／供應商名單。',
        };
    }
  };

  const { title, subtitle } = getTitle();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[32px] font-bold tracking-tight">{title}</h1>
        <p className="text-[14px] text-muted-foreground mt-1">{subtitle}</p>
      </div>
      {active === 'supplier-types' ? <SupplierTypesSettings /> : <WebPageSupplierModule />}
    </div>
  );
}
