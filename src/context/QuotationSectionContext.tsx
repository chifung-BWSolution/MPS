import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { PITCHING_PROJECT_TYPE_OPTIONS, type PitchingProjectType } from '@/data/pitchingData';
import {
  allowedProjectTypesForSection,
  projectTypeOptionsForSection,
  type QuotationSectionModule,
} from '@/lib/quotationSectionScope';

export type QuotationSectionContextValue = {
  moduleId: QuotationSectionModule;
  allowedTypes: readonly PitchingProjectType[];
  typeOptions: { id: PitchingProjectType; label: string }[];
};

const ALL_TYPES = PITCHING_PROJECT_TYPE_OPTIONS.map((opt) => opt.id);

const QuotationSectionContext = createContext<QuotationSectionContextValue>({
  moduleId: 'quotation',
  allowedTypes: ALL_TYPES,
  typeOptions: PITCHING_PROJECT_TYPE_OPTIONS,
});

export function QuotationSectionProvider({
  moduleId,
  children,
}: {
  moduleId: QuotationSectionModule;
  children: ReactNode;
}) {
  const value = useMemo<QuotationSectionContextValue>(
    () => ({
      moduleId,
      allowedTypes: allowedProjectTypesForSection(moduleId),
      typeOptions: projectTypeOptionsForSection(moduleId),
    }),
    [moduleId],
  );

  return (
    <QuotationSectionContext.Provider value={value}>
      {children}
    </QuotationSectionContext.Provider>
  );
}

export function useQuotationSection() {
  return useContext(QuotationSectionContext);
}
