import { BadDebtsPage } from '@/components/finance/BadDebtsPage';
import { BvAllocationPage } from '@/components/finance/BvAllocationPage';
import { DueSoonExpensesPage } from '@/components/finance/DueSoonExpensesPage';
import { PayablesPage } from '@/components/finance/PayablesPage';
import { ReceivablesPage } from '@/components/finance/ReceivablesPage';
import { RecurringExpensesPage } from '@/components/finance/RecurringExpensesPage';

export function FinanceModule({ subModule }: { subModule?: string }) {
  switch (subModule) {
    case 'due-soon':
      return <DueSoonExpensesPage />;
    case 'receivables':
      return <ReceivablesPage />;
    case 'payables':
      return <PayablesPage />;
    case 'bad-debts':
      return <BadDebtsPage />;
    case 'recurring':
      return <RecurringExpensesPage />;
    case 'bv-allocation':
    default:
      return <BvAllocationPage />;
  }
}
