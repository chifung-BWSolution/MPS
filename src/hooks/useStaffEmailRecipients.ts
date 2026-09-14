import { useMemo } from 'react';
import { useActiveStaffOptions } from '@/hooks/useActiveStaffOptions';
import { staffEmailRecipients, type AdsEmailAlertStaff } from '@/lib/adsEmailAlert';

export function useStaffEmailRecipients() {
  const { options, loading } = useActiveStaffOptions();
  const recipients = useMemo<AdsEmailAlertStaff[]>(() => staffEmailRecipients(options), [options]);
  return { recipients, loading };
}
