import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { PITCHING_PROJECT_TYPE_OPTIONS, type PitchingProjectType } from '@/data/pitchingData';
import { useQuotationProjectTypes } from '@/hooks/useQuotationProjectTypes';
import {
  allowedProjectTypesForSection,
  projectTypeOptionsForSection,
  type QuotationSectionModule,
} from '@/lib/quotationSectionScope';

export type QuotationSectionTypeOption = {
  id: string;
  code: string;
  label: string;
};

export type QuotationSectionContextValue = {
  moduleId: QuotationSectionModule;
  scoped: boolean;
  allowedTypes: readonly string[];
  allowedCodes: readonly string[];
  typeOptions: QuotationSectionTypeOption[];
};

const ALL_TYPES = PITCHING_PROJECT_TYPE_OPTIONS.map((opt) => opt.id);

const QuotationSectionContext = createContext<QuotationSectionContextValue>({
  moduleId: 'quotation',
  scoped: false,
  allowedTypes: ALL_TYPES,
  allowedCodes: ALL_TYPES,
  typeOptions: PITCHING_PROJECT_TYPE_OPTIONS.map((opt) => ({
    id: opt.id,
    code: opt.id,
    label: opt.label,
  })),
});

export function QuotationSectionProvider({
  moduleId,
  children,
}: {
  moduleId: QuotationSectionModule;
  children: ReactNode;
}) {
  const { types } = useQuotationProjectTypes();

  const value = useMemo<QuotationSectionContextValue>(() => {
    const sectionTypes = types.filter((type) => type.section === moduleId);
    if (sectionTypes.length === 0) {
      const fallback = projectTypeOptionsForSection(moduleId);
      const codes = allowedProjectTypesForSection(moduleId);
      return {
        moduleId,
        scoped: true,
        allowedTypes: codes,
        allowedCodes: codes,
        typeOptions: fallback.map((opt) => ({ id: opt.id, code: opt.id, label: opt.label })),
      };
    }
    return {
      moduleId,
      scoped: true,
      allowedTypes: sectionTypes.map((type) => type.id),
      allowedCodes: sectionTypes.map((type) => type.code),
      typeOptions: sectionTypes
        .filter((type) => type.isActive)
        .map((type) => ({ id: type.id, code: type.code, label: type.display })),
    };
  }, [moduleId, types]);

  return (
    <QuotationSectionContext.Provider value={value}>
      {children}
    </QuotationSectionContext.Provider>
  );
}

export function useQuotationSection() {
  return useContext(QuotationSectionContext);
}

export type { PitchingProjectType };
