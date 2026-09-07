from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def strip_between(rel: str, start: str, end: str) -> None:
    path = ROOT / rel
    text = path.read_text(encoding="utf-8")
    s = text.find(start)
    e = text.find(end)
    if s < 0 or e < 0 or e <= s:
        raise SystemExit(f"{rel}: markers not found start={s} end={e}")
    path.write_text(text[:s] + text[e:], encoding="utf-8")
    print(f"{rel}: removed {e - s} chars")


strip_between(
    "src/components/day-report/SubmitReportPage.tsx",
    "const hkPublicHolidays2025 = [",
    "function parseLocalDateStr(dateStr: string): Date {",
)
strip_between(
    "src/components/day-report/TeamDashboard.tsx",
    "const hkPublicHolidays2025 = [",
    "const WEEKDAY_LABELS = [",
)
strip_between(
    "src/components/day-report/WorkInspection.tsx",
    "const hkPublicHolidays = [",
    "function toDateStr(d: Date): string {",
)
print("ok")
