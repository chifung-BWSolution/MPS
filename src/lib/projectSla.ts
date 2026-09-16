export const SLA_DURATION_UNITS = ['days', 'hours', 'minutes'] as const;
export type SlaDurationUnit = (typeof SLA_DURATION_UNITS)[number];

export const SLA_DURATION_UNIT_LABELS: Record<SlaDurationUnit, string> = {
  days: '日',
  hours: '小時',
  minutes: '分鐘',
};

export type SlaDuration = {
  value: number;
  unit: SlaDurationUnit;
};

export type SlaOpeningHours = {
  start: string;
  end: string;
};

/** Stored on quotation_client_project.sla */
export type ProjectSla = {
  /** Minimum service availability, stored as n for “> n%”. */
  serviceAvailabilityPercent?: number;
  /** Maximum mean time to repair (“< n unit”). */
  mttr?: SlaDuration;
  /** Customer support opening hours (HH:MM–HH:MM). */
  csOpeningHours?: SlaOpeningHours;
  /** Maximum first response time (“< n unit”). */
  frt?: SlaDuration;
};

export type ProjectSlaDraft = {
  serviceAvailabilityPercent: string;
  mttrValue: string;
  mttrUnit: SlaDurationUnit;
  csOpenStart: string;
  csOpenEnd: string;
  frtValue: string;
  frtUnit: SlaDurationUnit;
};

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/;

export function normalizeTimeValue(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(TIME_RE);
  if (!match) return trimmed;
  return `${match[1]}:${match[2]}`;
}

export function emptyProjectSla(): ProjectSla {
  return {};
}

export function emptyProjectSlaDraft(): ProjectSlaDraft {
  return {
    serviceAvailabilityPercent: '',
    mttrValue: '',
    mttrUnit: 'hours',
    csOpenStart: '',
    csOpenEnd: '',
    frtValue: '',
    frtUnit: 'hours',
  };
}

function isDurationUnit(value: unknown): value is SlaDurationUnit {
  return typeof value === 'string' && (SLA_DURATION_UNITS as readonly string[]).includes(value);
}

function parsePositiveNumber(raw: unknown): number | undefined {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string' && raw.trim()) {
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function parseDuration(raw: unknown): SlaDuration | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const value = parsePositiveNumber((raw as SlaDuration).value);
  const unit = (raw as SlaDuration).unit;
  if (value == null || !isDurationUnit(unit)) return undefined;
  return { value, unit };
}

function parseOpeningHours(raw: unknown): SlaOpeningHours | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const start = normalizeTimeValue(String((raw as SlaOpeningHours).start ?? ''));
  const end = normalizeTimeValue(String((raw as SlaOpeningHours).end ?? ''));
  if (!start && !end) return undefined;
  return { start, end };
}

export function parseProjectSla(raw: unknown): ProjectSla {
  if (raw == null) return emptyProjectSla();
  let obj: unknown = raw;
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw) as unknown;
    } catch {
      return emptyProjectSla();
    }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return emptyProjectSla();
  const row = obj as Record<string, unknown>;
  const sla: ProjectSla = {};
  const percent = parsePositiveNumber(row.serviceAvailabilityPercent);
  if (percent != null) sla.serviceAvailabilityPercent = percent;
  const mttr = parseDuration(row.mttr);
  if (mttr) sla.mttr = mttr;
  const hours = parseOpeningHours(row.csOpeningHours);
  if (hours) sla.csOpeningHours = hours;
  const frt = parseDuration(row.frt);
  if (frt) sla.frt = frt;
  return sla;
}

export function slaToDraft(sla: ProjectSla | undefined): ProjectSlaDraft {
  const empty = emptyProjectSlaDraft();
  if (!sla) return empty;
  return {
    serviceAvailabilityPercent:
      sla.serviceAvailabilityPercent != null ? String(sla.serviceAvailabilityPercent) : '',
    mttrValue: sla.mttr != null ? String(sla.mttr.value) : '',
    mttrUnit: sla.mttr?.unit ?? empty.mttrUnit,
    csOpenStart: sla.csOpeningHours?.start ?? '',
    csOpenEnd: sla.csOpeningHours?.end ?? '',
    frtValue: sla.frt != null ? String(sla.frt.value) : '',
    frtUnit: sla.frt?.unit ?? empty.frtUnit,
  };
}

function parseDraftNumber(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : Number.NaN;
}

export function draftToProjectSla(draft: ProjectSlaDraft): ProjectSla {
  const sla: ProjectSla = {};
  const percent = parseDraftNumber(draft.serviceAvailabilityPercent);
  if (percent != null && !Number.isNaN(percent)) sla.serviceAvailabilityPercent = percent;
  const mttrValue = parseDraftNumber(draft.mttrValue);
  if (mttrValue != null && !Number.isNaN(mttrValue)) {
    sla.mttr = { value: mttrValue, unit: draft.mttrUnit };
  }
  const start = normalizeTimeValue(draft.csOpenStart);
  const end = normalizeTimeValue(draft.csOpenEnd);
  if (start || end) sla.csOpeningHours = { start, end };
  const frtValue = parseDraftNumber(draft.frtValue);
  if (frtValue != null && !Number.isNaN(frtValue)) {
    sla.frt = { value: frtValue, unit: draft.frtUnit };
  }
  return sla;
}

export function normalizeProjectSla(sla: ProjectSla): ProjectSla {
  const next: ProjectSla = {};
  if (sla.serviceAvailabilityPercent != null) {
    next.serviceAvailabilityPercent = sla.serviceAvailabilityPercent;
  }
  if (sla.mttr) next.mttr = { value: sla.mttr.value, unit: sla.mttr.unit };
  if (sla.csOpeningHours) {
    next.csOpeningHours = { start: sla.csOpeningHours.start, end: sla.csOpeningHours.end };
  }
  if (sla.frt) next.frt = { value: sla.frt.value, unit: sla.frt.unit };
  return next;
}

export function slaEquals(a: ProjectSla | undefined, b: ProjectSla | undefined): boolean {
  return JSON.stringify(normalizeProjectSla(a ?? {})) === JSON.stringify(normalizeProjectSla(b ?? {}));
}

export function validateProjectSla(sla: ProjectSla): string | null {
  if (sla.serviceAvailabilityPercent != null) {
    if (
      !Number.isFinite(sla.serviceAvailabilityPercent) ||
      sla.serviceAvailabilityPercent <= 0 ||
      sla.serviceAvailabilityPercent > 100
    ) {
      return '服務可用率須大於 0% 且不超過 100%';
    }
  }
  if (sla.mttr) {
    if (!Number.isFinite(sla.mttr.value) || sla.mttr.value <= 0) {
      return '平均修復時間 (MTTR) 須大於 0';
    }
    if (!isDurationUnit(sla.mttr.unit)) return '平均修復時間 (MTTR) 單位無效';
  }
  if (sla.frt) {
    if (!Number.isFinite(sla.frt.value) || sla.frt.value <= 0) {
      return '首次回應時間 (FRT) 須大於 0';
    }
    if (!isDurationUnit(sla.frt.unit)) return '首次回應時間 (FRT) 單位無效';
  }
  if (sla.csOpeningHours) {
    if (!sla.csOpeningHours.start || !sla.csOpeningHours.end) {
      return '請同時填寫客服開放開始與結束時間';
    }
    if (!TIME_RE.test(sla.csOpeningHours.start) || !TIME_RE.test(sla.csOpeningHours.end)) {
      return '客服開放時間格式須為 HH:MM';
    }
  }
  return null;
}
