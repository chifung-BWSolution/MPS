import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  calendarDaysBetween,
  calcClientProjectProgress,
  calcRemainingDays,
  clientProjectProgressConfig,
  DEFAULT_PITCHING_DEAL_FILTER,
  DEFAULT_PITCHING_STATUS_FILTER,
  formatPitchingRemainingDays,
  isFailedDeal,
  isPitchingFollowUpExpired,
  isPitchingStatusFilter,
  pitchingRemainingDaysTone,
  localTodayIso,
  matchesClientProjectProgressFilter,
  matchesPitchingDealFilter,
  matchesPitchingStatusFilter,
  PITCHING_LIST_STATUS_OPTIONS,
  PITCHING_EXPIRED_LABEL,
} from '../src/data/pitchingData';

assert.equal(calendarDaysBetween('2026-08-25', '2026-08-25'), 0);
assert.equal(calendarDaysBetween('2026-08-21', '2026-08-25'), 4);
assert.equal(calendarDaysBetween('2027-03-08', '2026-08-25'), -195);
assert.equal(calendarDaysBetween('bad', '2026-08-25'), null);

assert.equal(calcRemainingDays('2026-08-25', 'initial', '2026-08-25'), 45);
assert.equal(calcRemainingDays('2026-08-21', 'initial', '2026-08-25'), 41);
assert.equal(calcRemainingDays('2026-08-20', 'initial', '2026-08-25'), 40);
assert.equal(calcRemainingDays('2026-07-11', 'initial', '2026-08-25'), 0);
assert.equal(calcRemainingDays('2026-07-10', 'initial', '2026-08-25'), -1);

// Confirmed / future inquiry dates used to render "—" because status !== initial.
assert.equal(calcRemainingDays('2027-03-08', 'confirmed', '2026-08-25'), 240);
assert.equal(calcRemainingDays('2027-03-01', 'confirmed', '2026-08-25'), 233);
assert.equal(calcRemainingDays('2026-08-13', 'following_up', '2026-08-25'), 33);
assert.equal(calcRemainingDays('2026-08-13', 'closed', '2026-08-25'), 33);

assert.equal(calcRemainingDays('', 'initial', '2026-08-25'), null);
assert.equal(calcRemainingDays('not-a-date', 'initial', '2026-08-25'), null);
assert.equal(calcRemainingDays('2026-08-25T16:00:00.000Z', 'confirmed', '2026-08-25'), 45);

const today = localTodayIso();
assert.match(today, /^\d{4}-\d{2}-\d{2}$/);
assert.equal(calcRemainingDays(today, 'initial'), 45);

assert.equal(calcClientProjectProgress('2026-09-10', '2026-09-20', '2026-09-09'), 'pending');
assert.equal(calcClientProjectProgress('2026-09-10', '2026-09-20', '2026-09-10'), 'in_progress');
assert.equal(calcClientProjectProgress('2026-09-10', '2026-09-20', '2026-09-15'), 'in_progress');
assert.equal(calcClientProjectProgress('2026-09-10', '2026-09-20', '2026-09-20'), 'in_progress');
assert.equal(calcClientProjectProgress('2026-09-10', '2026-09-20', '2026-09-21'), 'completed');
assert.equal(calcClientProjectProgress(undefined, '2026-09-20', '2026-09-21'), null);
assert.equal(calcClientProjectProgress('2026-09-10', undefined, '2026-09-15'), null);
assert.equal(calcClientProjectProgress('', '2026-09-20', '2026-09-21'), null);
assert.equal(clientProjectProgressConfig.pending.label, '待開始');
assert.equal(clientProjectProgressConfig.in_progress.label, '進行中');
assert.equal(clientProjectProgressConfig.completed.label, '已完成');

assert.equal(PITCHING_EXPIRED_LABEL, '未能成交項目');
assert.equal(formatPitchingRemainingDays(null), '—');
assert.equal(formatPitchingRemainingDays(45), '45 天');
assert.equal(formatPitchingRemainingDays(1), '1 天');
assert.equal(formatPitchingRemainingDays(0), '未能成交項目');
assert.equal(formatPitchingRemainingDays(-1), '未能成交項目');
assert.equal(formatPitchingRemainingDays(-12), '未能成交項目');
assert.equal(pitchingRemainingDaysTone(null), 'empty');
assert.equal(pitchingRemainingDaysTone(1), 'green');
assert.equal(pitchingRemainingDaysTone(7), 'green');
assert.equal(pitchingRemainingDaysTone(8), 'yellow');
assert.equal(pitchingRemainingDaysTone(14), 'yellow');
assert.equal(pitchingRemainingDaysTone(15), 'orange');
assert.equal(pitchingRemainingDaysTone(28), 'orange');
assert.equal(pitchingRemainingDaysTone(29), 'red');
assert.equal(pitchingRemainingDaysTone(45), 'red');
assert.equal(pitchingRemainingDaysTone(46), 'red');
assert.equal(pitchingRemainingDaysTone(0), 'grey');
assert.equal(pitchingRemainingDaysTone(-3), 'grey');
assert.equal(DEFAULT_PITCHING_DEAL_FILTER, 'hide_failed');
assert.equal(DEFAULT_PITCHING_STATUS_FILTER, 'all');
assert.deepEqual(PITCHING_LIST_STATUS_OPTIONS, ['initial', 'following_up', 'closed']);
assert.equal(isPitchingStatusFilter('confirmed'), false);
assert.equal(isPitchingStatusFilter('initial'), true);
assert.equal(matchesPitchingStatusFilter('initial', 'all'), true);
assert.equal(matchesPitchingStatusFilter('confirmed', 'all'), true);
assert.equal(matchesPitchingStatusFilter('initial', 'initial'), true);
assert.equal(matchesPitchingStatusFilter('following_up', 'initial'), false);
assert.equal(matchesPitchingStatusFilter('closed', 'closed'), true);
assert.equal(matchesPitchingStatusFilter('confirmed', 'closed'), false);
assert.equal(isPitchingFollowUpExpired('2026-07-11', '2026-08-25'), true);
assert.equal(isPitchingFollowUpExpired('2026-07-12', '2026-08-25'), false);
assert.equal(isFailedDeal('initial', '2026-07-11', '2026-08-25'), true);
assert.equal(isFailedDeal('closed', '2026-07-11', '2026-08-25'), true);
assert.equal(isFailedDeal('following_up', '2026-07-11', '2026-08-25'), false);
assert.equal(isFailedDeal('initial', '2026-08-25', '2026-08-25'), false);
assert.equal(matchesPitchingDealFilter('initial', '2026-08-25', 'all', '2026-08-25'), true);
assert.equal(matchesPitchingDealFilter('confirmed', '2026-08-25', 'all', '2026-08-25'), false);
assert.equal(matchesPitchingDealFilter('initial', '2026-07-11', 'all', '2026-08-25'), true);
assert.equal(matchesPitchingDealFilter('initial', '2026-07-11', 'hide_failed', '2026-08-25'), false);
assert.equal(matchesPitchingDealFilter('initial', '2026-08-25', 'hide_failed', '2026-08-25'), true);
assert.equal(matchesPitchingDealFilter('closed', '2026-07-11', 'hide_failed', '2026-08-25'), false);
assert.equal(matchesPitchingDealFilter('closed', '2026-08-25', 'hide_failed', '2026-08-25'), true);
assert.equal(matchesPitchingDealFilter('following_up', '2026-07-11', 'hide_failed', '2026-08-25'), true);
assert.equal(matchesPitchingDealFilter('confirmed', '2026-08-25', 'hide_failed', '2026-08-25'), false);
assert.equal(matchesPitchingDealFilter('initial', '2026-07-11', 'show_failed', '2026-08-25'), true);
assert.equal(matchesPitchingDealFilter('closed', '2026-07-11', 'show_failed', '2026-08-25'), true);
assert.equal(matchesPitchingDealFilter('following_up', '2026-07-11', 'show_failed', '2026-08-25'), false);
assert.equal(matchesPitchingDealFilter('initial', '2026-08-25', 'show_failed', '2026-08-25'), false);
assert.equal(matchesClientProjectProgressFilter('2026-09-10', '2026-09-20', 'all', '2026-09-09'), true);
assert.equal(matchesClientProjectProgressFilter('2026-09-10', '2026-09-20', 'pending', '2026-09-09'), true);
assert.equal(matchesClientProjectProgressFilter('2026-09-10', '2026-09-20', 'in_progress', '2026-09-15'), true);
assert.equal(matchesClientProjectProgressFilter('2026-09-10', '2026-09-20', 'completed', '2026-09-21'), true);
assert.equal(matchesClientProjectProgressFilter('2026-09-10', '2026-09-20', 'pending', '2026-09-15'), false);
assert.equal(matchesClientProjectProgressFilter(undefined, '2026-09-20', 'pending', '2026-09-09'), false);

const pending = readFileSync(
  new URL('../src/components/quotation/AsanaPendingModule.tsx', import.meta.url),
  'utf8',
);
assert.match(pending, /RemainingDaysCell/);
assert.match(pending, /剩餘天數/);
assert.match(pending, /inquiryDate=\{task\.inquiryDate\}/);
assert.match(pending, /status="initial"/);
assert.match(pending, /task\.imported \? \(/);
assert.match(pending, /text-emerald-600 font-medium">已匯入/);
assert.match(pending, /colSpan=\{8\}/);
assert.doesNotMatch(pending, /區塊/);

const pitching = readFileSync(
  new URL('../src/components/quotation/PitchingModule.tsx', import.meta.url),
  'utf8',
);
assert.match(pitching, /formatPitchingRemainingDays/);
assert.match(pitching, /pitchingRemainingDaysTone/);
assert.match(pitching, /PitchingDealFilterSelect/);
assert.match(pitching, /PitchingStatusFilterSelect/);
assert.match(pitching, /PITCHING_LIST_STATUS_OPTIONS/);
assert.match(pitching, /全部項目狀態/);
assert.match(pitching, /隱藏未能成交/);
assert.match(pitching, /顯示未能成交/);
assert.doesNotMatch(pitching, /逾期/);
assert.doesNotMatch(pitching, /全部期限/);

const projects = readFileSync(
  new URL('../src/components/quotation/ProjectModule.tsx', import.meta.url),
  'utf8',
);
assert.match(projects, /matchesClientProjectProgressFilter/);
assert.match(projects, /全部工程進度/);
assert.match(projects, /clientProjectProgressConfig\.pending\.label/);
assert.doesNotMatch(projects, /PitchingDealFilterSelect/);
assert.doesNotMatch(projects, /全部狀態/);
assert.doesNotMatch(projects, /全部期限/);
assert.doesNotMatch(pending, /PitchingDealFilterSelect/);
assert.doesNotMatch(pending, /PitchingStatusFilterSelect/);
assert.doesNotMatch(pending, /DEFAULT_PITCHING_DEAL_FILTER/);

const closeExpired = readFileSync(
  new URL('../supabase/migrations/20260917061910_close_expired_initial_pitching.sql', import.meta.url),
  'utf8',
);
assert.match(closeExpired, /UPDATE public\.quotation_client_project/);
assert.match(closeExpired, /status = 'closed'/);
assert.match(closeExpired, /status = 'initial'/);
assert.match(closeExpired, /inquiry_date <= \(\(timezone\('Asia\/Hong_Kong', now\(\)\)\)::date - 45\)/);

console.log('pitching remaining days: ok');
