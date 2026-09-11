import { CRMModule } from '@/components/crm/CRMModule';
import { PitchingModule } from '@/components/quotation/PitchingModule';
import { ProjectModule } from '@/components/quotation/ProjectModule';
import { AsanaPendingModule } from '@/components/quotation/AsanaPendingModule';
import { QuotationDocTypesSettings } from '@/components/quotation/QuotationDocTypesSettings';
import { QuotationDocsList } from '@/components/quotation/QuotationDocsList';
import { QuotationSectionProvider } from '@/context/QuotationSectionContext';
import type { QuotationSectionModule } from '@/lib/quotationSectionScope';

function QuotationSectionPages({ subModule }: { subModule?: string }) {
  if (subModule === 'asana-pending') {
    return <AsanaPendingModule />;
  }

  if (subModule === 'pitching') {
    return <PitchingModule />;
  }

  if (subModule === 'projects') {
    return <ProjectModule />;
  }

  if (subModule === 'clients') {
    return <CRMModule subModule="list" />;
  }

  if (subModule === 'doc-types') {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-[32px] font-bold tracking-tight">文件類型</h1>
          <p className="text-[14px] text-muted-foreground mt-1">
            管理項目文件可選用的類型。
          </p>
        </div>
        <QuotationDocTypesSettings />
      </div>
    );
  }

  return <QuotationDocsList />;
}

export function QuotationModule({
  subModule,
  sectionModule = 'quotation',
}: {
  subModule?: string;
  sectionModule?: QuotationSectionModule;
}) {
  return (
    <QuotationSectionProvider moduleId={sectionModule}>
      <QuotationSectionPages subModule={subModule} />
    </QuotationSectionProvider>
  );
}
