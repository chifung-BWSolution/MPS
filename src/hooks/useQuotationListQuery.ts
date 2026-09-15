import { useCallback, useEffect, useState } from 'react';
import {
  quotationListQueryEqual,
  readQuotationListQuery,
  type QuotationListQuery,
} from '@/lib/quotationListQuery';
import {
  readQuotationClientPage,
  setQuotationListHash,
  type QuotationClientPage,
} from '@/lib/quotationProjectNavigation';

export function useQuotationListQuery(page: QuotationClientPage) {
  const [query, setQueryState] = useState(() => readQuotationListQuery());

  useEffect(() => {
    const sync = () => {
      const hash = globalThis.window?.location?.hash ?? '';
      const hashPage = readQuotationClientPage(hash);
      if (hashPage && hashPage !== page) return;
      const next = readQuotationListQuery(hash);
      setQueryState((prev) => (quotationListQueryEqual(prev, next) ? prev : next));
    };
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, [page]);

  const setQuery = useCallback(
    (patch: Partial<QuotationListQuery>) => {
      setQueryState((prev) => {
        const next = { ...prev, ...patch };
        if (quotationListQueryEqual(prev, next)) return prev;
        setQuotationListHash(page, next);
        return next;
      });
    },
    [page],
  );

  return { query, setQuery };
}
