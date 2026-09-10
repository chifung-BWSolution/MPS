import { optionalIsoDate, type PitchingExpenseItem, type PitchingStatus } from '../data/pitchingData';
import { isQuotationListDocType } from './quotationDocs';

export type ClientProjectStatusField =
  | 'estimated_income'
  | 'estimated_expenses'
  | 'signed_date'
  | 'handover_date'
  | 'quotation_doc';

export type ClientProjectStatusRecord = {
  estimatedIncome?: number;
  estimatedExpenses?: PitchingExpenseItem[];
  signedDate?: string;
  handoverDate?: string;
};

export type ClientProjectStatusDoc = {
  docTypeId: string;
};

const PIPELINE: PitchingStatus[] = ['initial', 'following_up', 'confirmed'];

function pipelineIndex(status: PitchingStatus): number {
  return PIPELINE.indexOf(status);
}

export function allowedStatusTargets(from: PitchingStatus): PitchingStatus[] {
  if (from === 'initial') return ['following_up', 'closed'];
  if (from === 'following_up') return ['initial', 'confirmed', 'closed'];
  if (from === 'confirmed') return ['following_up', 'initial', 'closed'];
  return ['initial', 'following_up', 'confirmed'];
}

export function isAllowedStatusTransition(from: PitchingStatus, to: PitchingStatus): boolean {
  return from === to || allowedStatusTargets(from).includes(to);
}

/** True when the user must fill extra fields before the status write. */
export function needsConversionPopup(from: PitchingStatus, to: PitchingStatus): boolean {
  if (from === to) return false;
  if (!isAllowedStatusTransition(from, to)) return false;
  if (to === 'closed') return false;
  if (from !== 'closed' && pipelineIndex(to) < pipelineIndex(from)) return false;
  if (from === 'closed' && to === 'initial') return false;
  return to === 'following_up' || to === 'confirmed';
}

export function isValidExpenseItem(item: Pick<PitchingExpenseItem, 'name' | 'amount'>): boolean {
  return Boolean(item.name?.trim()) && Number.isFinite(item.amount) && item.amount >= 0;
}

export function hasEstimatedIncome(value: number | undefined | null): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export function hasQualifyingQuotationDoc(docs: readonly ClientProjectStatusDoc[] | undefined): boolean {
  return Boolean(docs?.some((doc) => isQuotationListDocType(doc.docTypeId)));
}

export function missingFollowingUpFields(
  record: Pick<ClientProjectStatusRecord, 'estimatedIncome' | 'estimatedExpenses'>,
): ClientProjectStatusField[] {
  const missing: ClientProjectStatusField[] = [];
  if (!hasEstimatedIncome(record.estimatedIncome)) missing.push('estimated_income');
  const expenses = record.estimatedExpenses ?? [];
  if (!expenses.some(isValidExpenseItem)) missing.push('estimated_expenses');
  return missing;
}

export function missingConfirmedFields(
  record: ClientProjectStatusRecord,
  docs?: readonly ClientProjectStatusDoc[],
): ClientProjectStatusField[] {
  const missing = missingFollowingUpFields(record);
  if (!optionalIsoDate(record.signedDate)) missing.push('signed_date');
  if (!optionalIsoDate(record.handoverDate)) missing.push('handover_date');
  if (!hasQualifyingQuotationDoc(docs)) missing.push('quotation_doc');
  return missing;
}
