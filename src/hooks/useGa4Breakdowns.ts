import { useEffect, useState } from 'react';
import { invokeGa4Breakdowns } from '@/lib/ga4Api';
import { LIVE_GA4_BREAKDOWN_MAX_DAYS, validateLiveGa4Range } from '@/lib/ga4Traffic';
import type { Ga4CountryRow, Ga4DeviceRow, Ga4PageRow, Ga4SourceRow } from '@/types/ga4';

export function useGa4Breakdowns(
  propertyId: string | null,
  from: string,
  to: string,
) {
  const [pages, setPages] = useState<Ga4PageRow[]>([]);
  const [devices, setDevices] = useState<Ga4DeviceRow[]>([]);
  const [countries, setCountries] = useState<Ga4CountryRow[]>([]);
  const [sources, setSources] = useState<Ga4SourceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    if (!propertyId || !from || !to) {
      setPages([]);
      setDevices([]);
      setCountries([]);
      setSources([]);
      setError(null);
      return;
    }

    const range = validateLiveGa4Range(from, to);
    if (range.ok === false) {
      setSupported(false);
      setPages([]);
      setDevices([]);
      setCountries([]);
      setSources([]);
      setError(range.error);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setSupported(true);
    setLoading(true);
    setError(null);
    invokeGa4Breakdowns({ propertyId, from, to })
      .then((res) => {
        if (cancelled) return;
        setPages(res.pages || []);
        setDevices(res.devices || []);
        setCountries(res.countries || []);
        setSources(res.sources || []);
        setError(res.errors?.length ? res.errors.slice(0, 3).join('；') : null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [propertyId, from, to]);

  return {
    pages,
    devices,
    countries,
    sources,
    loading,
    error,
    supported,
    maxDays: LIVE_GA4_BREAKDOWN_MAX_DAYS,
  };
}
