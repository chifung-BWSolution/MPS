import { useCallback, useEffect, useMemo, useState } from 'react';
import { useCompanies } from '@/hooks/useCompanies';
import { supabase } from '@/lib/supabase';
import { QUERY_CACHE_KEYS, cachedQuery, peekCachedQuery } from '@/lib/queryCache';
import {
  DEFAULT_STAFF_DIRECTORY_FILTER,
  STAFF_FILTER_ALL,
  buOptionsFor,
  matchesStaffDirectoryFilter,
  positionOptionsFor,
  teamOptionsFor,
  type StaffDirectoryFilterState,
  type StaffFilterFields,
  type StaffStatusFilter,
} from '@/components/day-report/staffDirectoryFilter';

const selectClass = 'h-8 px-2.5 border border-[rgba(13,26,45,0.12)] rounded-md text-[13px] bg-white text-[#0d1a2d] focus:outline-none focus:ring-1 focus:ring-teal-600';

const ROSTER_SELECT = 'id, status, termination_date, company_list_id, team_name, position';

async function fetchStaffRoster(): Promise<StaffFilterFields[]> {
  const pageSize = 1000;
  const all: StaffFilterFields[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('staffs')
      .select(ROSTER_SELECT)
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const rows = (data || []) as StaffFilterFields[];
    all.push(...rows);
    if (rows.length < pageSize) break;
  }
  return all;
}

function useStaffRoster(enabled: boolean) {
  const cached = enabled ? peekCachedQuery<StaffFilterFields[]>(QUERY_CACHE_KEYS.staffDirectory) : undefined;
  const [staff, setStaff] = useState<StaffFilterFields[]>(cached ?? []);
  const [ready, setReady] = useState(enabled && cached !== undefined);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void cachedQuery(QUERY_CACHE_KEYS.staffDirectory, fetchStaffRoster)
      .then((rows) => {
        if (cancelled) return;
        setStaff(rows);
        setFailed(false);
        setReady(true);
      })
      .catch((err: Error) => {
        console.error('[StaffDirectoryFilter] roster fetch failed:', err);
        if (!cancelled) {
          setFailed(true);
          setReady(true);
        }
      });
    return () => { cancelled = true; };
  }, [enabled]);

  return { staff, ready, failed };
}

type FilterOptions = {
  /** Staff this page can show. Omit to use the full staff directory. */
  roster?: StaffFilterFields[] | null;
  /** When false, `includes` matches nobody until this page's roster is ready. */
  ready?: boolean;
};

export function useStaffDirectoryFilter(options?: FilterOptions) {
  const external = options?.roster;
  const internal = useStaffRoster(external == null);
  const roster = external ?? internal.staff;
  const ready = options?.ready ?? internal.ready;
  const failed = external == null && internal.failed;
  const { companies } = useCompanies();

  const [status, setStatus] = useState<StaffStatusFilter>(DEFAULT_STAFF_DIRECTORY_FILTER.status);
  const [buId, setBuId] = useState(DEFAULT_STAFF_DIRECTORY_FILTER.buId);
  const [team, setTeam] = useState(DEFAULT_STAFF_DIRECTORY_FILTER.team);
  const [position, setPosition] = useState(DEFAULT_STAFF_DIRECTORY_FILTER.position);

  const filter = useMemo<StaffDirectoryFilterState>(() => ({
    status, buId, team, position,
  }), [status, buId, team, position]);

  const buOptions = useMemo(
    () => buOptionsFor(roster, companies, filter),
    [roster, companies, filter],
  );
  const teams = useMemo(() => teamOptionsFor(roster, filter), [roster, filter]);
  const positions = useMemo(() => positionOptionsFor(roster, filter), [roster, filter]);

  useEffect(() => {
    if (!ready || failed) return;
    if (buId !== STAFF_FILTER_ALL && !buOptions.some((bu) => bu.id === buId)) {
      setBuId(STAFF_FILTER_ALL);
      return;
    }
    if (team !== STAFF_FILTER_ALL && !teams.includes(team)) {
      setTeam(STAFF_FILTER_ALL);
      return;
    }
    if (position !== STAFF_FILTER_ALL && !positions.includes(position)) {
      setPosition(STAFF_FILTER_ALL);
    }
  }, [ready, failed, buId, buOptions, team, teams, position, positions]);

  const rosterById = useMemo(() => {
    const map = new Map<string, StaffFilterFields>();
    roster.forEach((row) => {
      if (row.id) map.set(row.id, row);
    });
    return map;
  }, [roster]);

  const matches = useCallback((staff: StaffFilterFields) => (
    matchesStaffDirectoryFilter(staff, filter)
  ), [filter]);

  const includes = useCallback((staffId: string) => {
    if (!ready) return false;
    if (failed && rosterById.size === 0) return true;
    const row = rosterById.get(staffId);
    if (!row) return false;
    return matchesStaffDirectoryFilter(row, filter);
  }, [ready, failed, rosterById, filter]);

  return {
    status,
    buId,
    team,
    position,
    setStatus,
    setBuId,
    setTeam,
    setPosition,
    buOptions,
    teams,
    positions,
    matches,
    includes,
    ready,
  };
}

export type StaffDirectoryFilterController = ReturnType<typeof useStaffDirectoryFilter>;

export function StaffDirectoryFilterSelects({ filter }: { filter: StaffDirectoryFilterController }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={filter.status}
        onChange={(e) => filter.setStatus(e.target.value as StaffStatusFilter)}
        className={selectClass}
        aria-label="狀態"
      >
        <option value="all">所有狀態</option>
        <option value="active">在職</option>
        <option value="inactive">離職</option>
      </select>
      <select
        value={filter.buId}
        onChange={(e) => filter.setBuId(e.target.value)}
        className={selectClass}
        aria-label="BU"
      >
        <option value={STAFF_FILTER_ALL}>所有 BU</option>
        {filter.buOptions.map((bu) => (
          <option key={bu.id} value={bu.id}>{bu.label}</option>
        ))}
      </select>
      <select
        value={filter.team}
        onChange={(e) => filter.setTeam(e.target.value)}
        className={`${selectClass} min-w-[148px]`}
        aria-label="團隊"
      >
        <option value={STAFF_FILTER_ALL}>所有團隊</option>
        {filter.teams.map((team) => (
          <option key={team} value={team}>{team}</option>
        ))}
      </select>
      <select
        value={filter.position}
        onChange={(e) => filter.setPosition(e.target.value)}
        className={`${selectClass} min-w-[120px]`}
        aria-label="職位"
      >
        <option value={STAFF_FILTER_ALL}>所有職位</option>
        {filter.positions.map((position) => (
          <option key={position} value={position}>{position}</option>
        ))}
      </select>
    </div>
  );
}
