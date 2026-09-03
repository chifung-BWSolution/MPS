import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface GoogleAdsAccountOption {
  customerId: string;
  descriptiveName: string;
  isManager: boolean;
}

type AccountRow = {
  customer_id: string;
  descriptive_name: string;
  is_manager: boolean;
};

function mapRow(row: AccountRow): GoogleAdsAccountOption {
  return {
    customerId: row.customer_id,
    descriptiveName: row.descriptive_name,
    isManager: row.is_manager,
  };
}

export function useGoogleAdsAccounts() {
  
  const [accounts, setAccounts] = useState<GoogleAdsAccountOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase
      .from('google_ads_accounts')
      .select('customer_id, descriptive_name, is_manager')
      .order('descriptive_name', { ascending: true });

    if (err) {
      setError(err.message);
      setAccounts([]);
    } else {
      setError(null);
      setAccounts((data as AccountRow[] | null)?.map(mapRow) ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const clientAccounts = accounts.filter((a) => !a.isManager);

  return { accounts, clientAccounts, loading, error, refresh };
}
