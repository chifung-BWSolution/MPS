import { WebPageSupplierModule } from './WebPageSupplierModule';

/** Supplier hub — only real-data modules remain (網頁供應商). */
export function SupplierModule({ subModule }: { subModule?: string }) {
  const active = subModule || 'web-suppliers';

  if (active !== 'web-suppliers') {
    return (
      <div className="space-y-2">
        <h1 className="text-[32px] font-bold tracking-tight">供應商</h1>
        <p className="text-[14px] text-muted-foreground">此供應商子頁面已移除。</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[32px] font-bold tracking-tight">網頁供應商</h1>
        <p className="text-[14px] text-muted-foreground mt-1">
          管理可購買反向連結的網站／供應商名單。
        </p>
      </div>
      <WebPageSupplierModule />
    </div>
  );
}
