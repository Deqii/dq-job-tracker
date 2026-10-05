import { describe, expect, it, vi } from 'vitest';

import { buildApplicationsQuery } from '../hooks/useApplications';
import { emptyCounts, responseRateOf } from '../hooks/useDashboard';
import { formatDate, formatPercent, parseDateInput, timeAgo, toISODateInput } from '../lib/utils';
import { emptyToUndefined } from '../schemas';
import { ApplicationStatus } from '../types';

describe('formatDate', () => {
  it('formats an ISO timestamp using the local timezone', () => {
    const result = formatDate('2026-03-15T12:00:00.000Z');
    expect(result).toMatch(/2026/);
    expect(result).toMatch(/Mar/);
  });

  it('returns the input unchanged when the date is invalid', () => {
    expect(formatDate('not-a-date')).toBe('not-a-date');
  });
});

describe('toISODateInput / parseDateInput', () => {
  it('round-trips a local date through the YYYY-MM-DD input format', () => {
    const date = new Date(2026, 6, 4, 15, 30);
    expect(toISODateInput(date)).toBe('2026-07-04');
  });

  it('parses a date input value back into a local Date', () => {
    const parsed = parseDateInput('2026-07-04');
    expect(parsed).not.toBeNull();
    expect(parsed!.getFullYear()).toBe(2026);
    expect(parsed!.getMonth()).toBe(6);
    expect(parsed!.getDate()).toBe(4);
  });

  it('returns null for an empty value', () => {
    expect(parseDateInput('')).toBeNull();
  });
});

describe('timeAgo', () => {
  it('reports relative time based on now', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-17T12:00:00Z'));

    expect(timeAgo('2026-09-12T12:00:00Z')).toBe('5 days ago');
    expect(timeAgo('2026-09-17T11:00:00Z')).toBe('1 hour ago');
    expect(timeAgo('2026-09-17T11:46:00Z')).toBe('14 minutes ago');

    vi.useRealTimers();
  });
});

describe('formatPercent', () => {
  it('renders rounded percentages', () => {
    expect(formatPercent(33.333)).toBe('33%');
    expect(formatPercent(0)).toBe('0%');
  });
});

describe('responseRateOf', () => {
  it('counts interview and offer stages as responses', () => {
    const counts = emptyCounts();
    counts[ApplicationStatus.APPLIED] = 8;
    counts[ApplicationStatus.INTERVIEW] = 1;
    counts[ApplicationStatus.OFFER] = 1;
    expect(responseRateOf(counts, 10)).toBe(20);
  });

  it('returns null when there is nothing to measure', () => {
    expect(responseRateOf(emptyCounts(), 0)).toBeNull();
  });
});

describe('buildApplicationsQuery', () => {
  it('omits empty filters', () => {
    expect(buildApplicationsQuery({})).toBe('');
    expect(buildApplicationsQuery({ search: '', status: '' })).toBe('');
  });

  it('builds query params for set filters', () => {
    const query = buildApplicationsQuery({
      search: 'engineer',
      status: ApplicationStatus.INTERVIEW,
      tag: 'referral',
      from: '2026-01-01',
      to: '2026-12-31',
    });
    expect(query).toBe(
      '?search=engineer&status=INTERVIEW&tag=referral&from=2026-01-01&to=2026-12-31',
    );
  });
});

describe('emptyToUndefined', () => {
  it('trims and returns undefined for blank strings', () => {
    expect(emptyToUndefined('')).toBeUndefined();
    expect(emptyToUndefined('   ')).toBeUndefined();
    expect(emptyToUndefined(undefined)).toBeUndefined();
  });

  it('returns the trimmed value for real input', () => {
    expect(emptyToUndefined('  Acme  ')).toBe('Acme');
  });
});