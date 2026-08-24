import { useCallback, useEffect, useState } from 'react';
import {
  readQuotationClientPage,
  readSelectedQuotationProjectId,
  setQuotationClientHash,
  writeSelectedQuotationProjectId,
  type QuotationClientPage,
} from '@/lib/quotationProjectNavigation';

export function useQuotationClientDetailId(page: QuotationClientPage) {
  const [detailId, setDetailId] = useState(() => {
    const hashPage = readQuotationClientPage();
    if (hashPage && hashPage !== page) return null;
    return readSelectedQuotationProjectId();
  });

  useEffect(() => {
    const sync = () => {
      const hash = globalThis.window?.location?.hash ?? '';
      const hashPage = readQuotationClientPage(hash);
      if (hashPage && hashPage !== page) {
        setDetailId(null);
        return;
      }
      setDetailId(readSelectedQuotationProjectId(hash));
    };
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, [page]);

  const openDetail = useCallback(
    (id: string) => {
      writeSelectedQuotationProjectId(id);
      setQuotationClientHash(page, id);
      setDetailId(id);
    },
    [page],
  );

  const closeDetail = useCallback(() => {
    writeSelectedQuotationProjectId(null);
    setQuotationClientHash(page, null);
    setDetailId(null);
  }, [page]);

  return { detailId, openDetail, closeDetail };
}
