import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';

import { downloadExport, useApplications } from '../hooks/useApplications';
import { useDashboard, emptyCounts } from '../hooks/useDashboard';
import { useDebouncedValue } from '../hooks/useDebounce';
import { useTags } from '../hooks/useTags';
import { getErrorMessage } from '../lib/api';
import { STATUS_LABELS } from '../lib/utils';
import { ApplicationStatus } from '../types';
import type { Application } from '../types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDay(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

function dayDiff(iso: string, now: Date): number {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 0;
  return Math.floor((now.getTime() - date.getTime()) / 86_400_000);
}

function byAppliedAtDesc(a: Application, b: Application): number {
  const applied = new Date(b.appliedAt).getTime() - new Date(a.appliedAt).getTime();
  if (applied !== 0) return applied;
  const created = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  if (created !== 0) return created;
  return b.id.localeCompare(a.id);
}

function statusSince(application: Application, status: ApplicationStatus): string | null {
  const entries = (application.statusHistory ?? []).filter((entry) => entry.status === status);
  return entries[entries.length - 1]?.changedAt ?? null;
}

function ProgressCard({ application, index }: { application: Application; index: number }) {
  const tag = application.tags?.[0]?.name;
  const since = statusSince(application, application.currentStatus);
  const isInterview = application.currentStatus === ApplicationStatus.INTERVIEW;

  return (
    <article className="card-b card-in" style={{ '--i': index, opacity: 1, scale: 1, background: 'var(--card)', border: '2px solid var(--ink)', borderRadius: '18px', boxShadow: '3px 3px 0 var(--ink)', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '12px' } as CSSProperties}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
        <div style={{ minWidth: 0 }}>
          <h3 style={{ margin: 0, fontFamily: 'var(--display)', fontWeight: 700, fontSize: '18px', letterSpacing: '-0.015em', lineHeight: 1.2, textWrap: 'balance' }}>
            <Link className="lnk" to={`/applications/${application.id}`}>{application.roleTitle}</Link>
          </h3>
          <div style={{ marginTop: '3px', fontSize: '14px', color: 'var(--ink2)' }}>{application.company?.name}</div>
        </div>
        {application.salaryRange ? (
          <span className="sticker" style={{ '--r': '-3deg', '--d': '100ms', padding: '4px 12px', border: '2px solid var(--ink)', borderRadius: '999px', background: 'var(--marker)', fontSize: '13px', fontWeight: 700, whiteSpace: 'nowrap' } as CSSProperties}>{application.salaryRange}</span>
        ) : null}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 11px 3px 9px', border: '1.5px solid var(--ink)', borderRadius: '999px', fontSize: '12.5px', fontWeight: 600 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
          <span>{application.location ?? '—'}</span>
        </span>
        {tag ? (
          <span style={{ padding: '3px 11px', border: '1.5px solid var(--ink)', borderRadius: '999px', background: 'var(--paper)', fontSize: '12.5px', fontWeight: 700 }}>#{tag}</span>
        ) : null}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '4px 12px', paddingTop: '12px', borderTop: '2px dashed var(--line)' }}>
        <span style={{ fontSize: '13px', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>Applied {formatDay(application.appliedAt)}</span>
        {since ? <span style={{ fontSize: '13px', color: 'var(--ink2)' }}>{STATUS_LABELS[application.currentStatus]} since {formatDay(since)}</span> : null}
      </div>
      {isInterview ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', paddingTop: '12px', borderTop: '2px dashed var(--line)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13.5px', color: 'var(--ink2)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"></rect><path d="M16 2v4"></path><path d="M8 2v4"></path><path d="M3 10h18"></path></svg>
            <span>No schedule set</span>
          </span>
          {/* TODO: wire "Set schedule" once applications have a schedule model. */}
          <button type="button" className="hard" style={{ height: '40px', padding: '0 16px', borderRadius: '20px', border: '2px solid var(--ink)', background: 'var(--card)', boxShadow: '3px 3px 0 var(--ink)', fontWeight: 700, fontSize: '13.5px' }}>Set schedule</button>
        </div>
      ) : null}
    </article>
  );
}

export function ApplicationsPage() {
  const [search, setSearch] = useState('');
  const [source, setSource] = useState('all');
  const [visibleCount, setVisibleCount] = useState(5);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');

  const now = new Date();
  const debouncedSearch = useDebouncedValue(search, 300);

  const filters = useMemo(() => ({ search: debouncedSearch, tag: source === 'all' ? '' : source }), [debouncedSearch, source]);
  const { data: applications = [], isError, error } = useApplications({ search: debouncedSearch });
  const { data: dashboard } = useDashboard();
  const { data: tags = [] } = useTags();

  const counts = dashboard?.counts ?? emptyCounts();
  const total = dashboard?.total ?? applications.length;

  useEffect(() => {
    setVisibleCount(5);
  }, [source, debouncedSearch]);

  const sourceFiltered = useMemo(
    () => (source === 'all' ? applications : applications.filter((application) => application.tags?.some((tag) => tag.name === source))),
    [applications, source],
  );

  const tagCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const tag of tags) map.set(tag.name, 0);
    for (const application of applications) {
      for (const tag of application.tags ?? []) map.set(tag.name, (map.get(tag.name) ?? 0) + 1);
    }
    return map;
  }, [applications, tags]);

  const chips = useMemo(
    () => [
      { id: 'all', label: 'All', n: applications.length },
      ...tags.map((tag) => ({ id: tag.name, label: `#${tag.name}`, n: tagCounts.get(tag.name) ?? 0 })),
    ],
    [applications.length, tags, tagCounts],
  );

  const applied = useMemo(
    () => sourceFiltered.filter((application) => application.currentStatus === ApplicationStatus.APPLIED).sort(byAppliedAtDesc),
    [sourceFiltered],
  );
  const interviews = useMemo(
    () => sourceFiltered.filter((application) => application.currentStatus === ApplicationStatus.INTERVIEW).sort(byAppliedAtDesc),
    [sourceFiltered],
  );
  const offers = useMemo(
    () => sourceFiltered.filter((application) => application.currentStatus === ApplicationStatus.OFFER).sort(byAppliedAtDesc),
    [sourceFiltered],
  );

  const visibleApplied = applied.slice(0, visibleCount);
  const appliedTotal = source === 'all' ? Math.max(counts[ApplicationStatus.APPLIED], applied.length) : applied.length;
  const moreCount = Math.max(0, appliedTotal - visibleApplied.length);

  const handleExport = async () => {
    setExporting(true);
    setExportError('');
    try {
      await downloadExport(filters);
    } catch (err) {
      setExportError(getErrorMessage(err));
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <header style={{ padding: '20px 0', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px 16px' }}>
        <label className="field" style={{ flex: '1 1 280px', maxWidth: '520px', height: '48px', display: 'flex', alignItems: 'center', gap: '10px', padding: '0 18px', background: 'var(--card)', border: '2px solid var(--ink)', borderRadius: '24px', color: 'var(--ink3)' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="M21 21l-4.3-4.3"></path></svg>
          <input
            type="text"
            aria-label="Search companies, roles, notes"
            placeholder="Search companies, roles, notes"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            style={{ flex: '1 1 auto', minWidth: 0, height: '100%', background: 'transparent', border: 0, fontSize: '15px', color: 'var(--ink)' }}
          />
          {/* TODO: add the actual Ctrl K keyboard shortcut; this is only the hint. */}
          <span style={{ fontSize: '11.5px', fontWeight: 600, border: '1.5px solid var(--ink3)', borderRadius: '7px', padding: '2px 7px', color: 'var(--ink3)' }}>Ctrl K</span>
        </label>
        {/* TODO: notifications have no destination or data source yet. */}
        <button type="button" className="hard" aria-label="Notifications" style={{ marginLeft: 'auto', width: '48px', height: '48px', borderRadius: '50%', border: '2px solid var(--ink)', background: 'var(--card)', boxShadow: '3px 3px 0 var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"></path><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"></path></svg>
        </button>
      </header>

      <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: '16px 24px' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px 18px' }}>
            <h1 style={{ margin: 0, fontFamily: 'var(--display)', fontWeight: 800, fontSize: '56px', lineHeight: 1, letterSpacing: '-0.035em' }}>Applications</h1>
            <span className="sticker" style={{ '--r': '-5deg', '--d': '0ms', padding: '5px 14px', border: '2px solid var(--ink)', borderRadius: '999px', background: 'var(--marker)', boxShadow: '3px 3px 0 var(--ink)', fontSize: '14px', fontWeight: 800, whiteSpace: 'nowrap' } as CSSProperties}>{total} total</span>
          </div>
          <p style={{ margin: '12px 0 0', fontSize: '17px', lineHeight: 1.5, color: 'var(--ink2)' }}>{counts[ApplicationStatus.APPLIED]} of them are still waiting at Applied.</p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px' }}>
          <button type="button" className="hard" onClick={() => void handleExport()} disabled={exporting} style={{ height: '48px', padding: '0 20px', borderRadius: '24px', border: '2px solid var(--ink)', background: 'var(--card)', boxShadow: '3px 3px 0 var(--ink)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><path d="M7 10l5 5 5-5"></path><path d="M12 15V3"></path></svg>
            <span>Export .xlsx</span>
          </button>
          <Link className="hard" to="/applications/new" style={{ '--sh': 'var(--marker)', height: '48px', padding: '0 22px', borderRadius: '24px', border: '2px solid var(--ink)', background: 'var(--ink)', color: 'var(--card)', boxShadow: '4px 4px 0 var(--sh)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' } as CSSProperties}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5v14"></path><path d="M5 12h14"></path></svg>
            <span>New application</span>
          </Link>
        </div>
      </div>

      {exportError ? <p style={{ margin: '12px 0 0', color: 'var(--crit)', fontSize: '15px' }}>{exportError}</p> : null}
      {isError ? <p style={{ margin: '12px 0 0', color: 'var(--crit)', fontSize: '15px' }}>{getErrorMessage(error)}</p> : null}

      <div style={{ marginTop: '28px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '12px 16px' }}>
        <div role="group" aria-label="Filter by source" style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
          {chips.map((chip) => {
            const active = source === chip.id;
            return (
              <button key={chip.id} type="button" className="chip-b" aria-pressed={active} onClick={() => setSource(chip.id)} style={{ height: '42px', padding: '0 8px 0 18px', borderRadius: '21px', border: '2px solid var(--ink)', display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 700, fontSize: '14px', background: active ? 'var(--ink)' : 'var(--card)', color: active ? 'var(--card)' : 'var(--ink)' }}>
                <span>{chip.label}</span>
                <span style={{ minWidth: '28px', height: '26px', padding: '0 8px', borderRadius: '13px', border: '2px solid var(--ink)', background: active ? 'var(--marker)' : 'var(--paper)', color: 'var(--ink)', fontSize: '13px', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{chip.n}</span>
              </button>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: '2px', padding: '3px', background: 'var(--card)', border: '2px solid var(--ink)', borderRadius: '23px' }}>
          <button type="button" aria-pressed="true" style={{ height: '34px', padding: '0 16px', borderRadius: '17px', border: '2px solid var(--ink)', background: 'var(--ink)', color: 'var(--card)', fontWeight: 700, fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="18" rx="1.5"></rect><rect x="14" y="3" width="7" height="10" rx="1.5"></rect></svg>
            <span>Board</span>
          </button>
          {/* TODO: build the table view; the toggle is visual only for now. */}
          <button type="button" className="nav-b" aria-pressed="false" style={{ height: '34px', padding: '0 16px', borderRadius: '17px', border: '2px solid transparent', color: 'var(--ink2)', fontWeight: 600, fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18"></path><path d="M3 12h18"></path><path d="M3 18h18"></path></svg>
            <span>Table</span>
          </button>
        </div>
      </div>

      <div style={{ marginTop: '24px', display: 'flex', flexWrap: 'wrap', alignItems: 'stretch', gap: '24px' }}>
        <div style={{ flex: '1.45 1 480px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', height: '56px', padding: '0 18px', border: '2px dashed var(--ink3)', borderRadius: '20px', color: 'var(--ink3)' }}>
            <span style={{ width: '16px', height: '16px', borderRadius: '5px', border: '2px solid var(--ink3)', background: 'var(--gray)', flex: '0 0 auto' }}></span>
            <span style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: '18px', letterSpacing: '-0.015em' }}>Wishlist</span>
            <span style={{ marginLeft: 'auto', minWidth: '30px', height: '26px', padding: '0 10px', borderRadius: '13px', border: '2px dashed var(--ink3)', fontSize: '14px', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{counts[ApplicationStatus.WISHLIST]}</span>
          </div>

          <section style={{ flex: '1 1 auto', background: 'var(--side)', border: '2px solid var(--ink)', borderRadius: '24px', padding: '18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minHeight: '34px' }}>
              <span style={{ width: '18px', height: '18px', borderRadius: '5px', border: '2px solid var(--ink)', background: 'var(--s1)', flex: '0 0 auto' }}></span>
              <h2 style={{ margin: 0, fontFamily: 'var(--display)', fontWeight: 700, fontSize: '22px', letterSpacing: '-0.02em', lineHeight: 1.1 }}>Applied</h2>
              <span style={{ minWidth: '32px', height: '28px', padding: '0 10px', borderRadius: '14px', border: '2px solid var(--ink)', background: 'var(--card)', fontSize: '14px', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{counts[ApplicationStatus.APPLIED]}</span>
              <span style={{ marginLeft: 'auto', fontSize: '13px', color: 'var(--ink3)' }}>Newest first</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(250px, 100%), 1fr))', alignContent: 'start', gap: '14px' }}>
              {visibleApplied.map((application, index) => {
                const tag = application.tags?.[0]?.name;
                const future = new Date(application.appliedAt).getTime() > now.getTime();
                const waiting = dayDiff(application.appliedAt, now);
                return (
                  <Link key={application.id} to={`/applications/${application.id}`} style={{ display: 'block', minWidth: 0 }}>
                    <article className="card-b card-in" style={{ '--i': index, opacity: 1, scale: 1, background: 'var(--card)', border: '2px solid var(--ink)', borderRadius: '18px', boxShadow: '3px 3px 0 var(--ink)', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '12px' } as CSSProperties}>
                      <div style={{ minWidth: 0 }}>
                        <h3 style={{ margin: 0, fontFamily: 'var(--display)', fontWeight: 700, fontSize: '18px', letterSpacing: '-0.015em', lineHeight: 1.2, textWrap: 'balance' }}>{application.roleTitle}</h3>
                        <div style={{ marginTop: '3px', fontSize: '14px', color: 'var(--ink2)' }}>{application.company?.name}</div>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 11px 3px 9px', border: '1.5px solid var(--ink)', borderRadius: '999px', fontSize: '12.5px', fontWeight: 600 }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                          <span>{application.location ?? '—'}</span>
                        </span>
                        {tag ? (
                          <span style={{ padding: '3px 11px', border: '1.5px solid var(--ink)', borderRadius: '999px', background: 'var(--paper)', fontSize: '12.5px', fontWeight: 700 }}>#{tag}</span>
                        ) : null}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '4px 12px', paddingTop: '12px', borderTop: '2px dashed var(--line)' }}>
                        <span style={{ fontSize: '13px', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>Applied {formatDay(application.appliedAt)}</span>
                        {!future ? <span style={{ fontSize: '13px', color: 'var(--ink2)' }}>Waiting {waiting} days</span> : null}
                      </div>
                      {future ? (
                        <span className="sticker" style={{ '--r': '-2deg', '--d': '300ms', alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 11px 3px 9px', border: '1.5px solid var(--ink)', borderRadius: '999px', background: 'var(--marker)', fontSize: '12.5px', fontWeight: 700 } as CSSProperties}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><path d="M12 9v4"></path><path d="M12 17h.01"></path></svg>
                          <span>Future date, please check</span>
                        </span>
                      ) : null}
                    </article>
                  </Link>
                );
              })}
              {moreCount > 0 ? (
                <button type="button" className="more-b card-in" onClick={() => setVisibleCount(appliedTotal)} style={{ '--i': visibleApplied.length, minHeight: '150px', border: '2px dashed var(--ink)', borderRadius: '18px', background: 'transparent', fontWeight: 700, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px', textAlign: 'center' } as CSSProperties}>
                  <span className="plus" style={{ display: 'flex' }}><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5v14"></path><path d="M5 12h14"></path></svg></span>
                  <span style={{ fontFamily: 'var(--display)', fontSize: '17px', letterSpacing: '-0.01em' }}>Show {moreCount} more</span>
                </button>
              ) : null}
            </div>
          </section>
        </div>

        <div style={{ flex: '1 1 380px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', height: '56px', padding: '0 18px', background: 'var(--card)', border: '2px solid var(--ink)', borderRadius: '20px' }}>
            <span style={{ width: '16px', height: '16px', borderRadius: '5px', border: '2px solid var(--ink)', background: 'var(--s2)', flex: '0 0 auto' }}></span>
            <span style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: '18px', letterSpacing: '-0.015em' }}>Assessment</span>
            <span style={{ marginLeft: 'auto', minWidth: '30px', height: '26px', padding: '0 10px', borderRadius: '13px', border: '2px solid var(--ink)', background: 'var(--paper)', fontSize: '14px', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{counts[ApplicationStatus.ASSESSMENT]}</span>
          </div>

          <section style={{ background: 'var(--side)', border: '2px solid var(--ink)', borderRadius: '24px', padding: '18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minHeight: '34px' }}>
              <span style={{ width: '18px', height: '18px', borderRadius: '5px', border: '2px solid var(--ink)', background: 'var(--s3)', flex: '0 0 auto' }}></span>
              <h2 style={{ margin: 0, fontFamily: 'var(--display)', fontWeight: 700, fontSize: '22px', letterSpacing: '-0.02em', lineHeight: 1.1 }}>Interview</h2>
              <span style={{ minWidth: '32px', height: '28px', padding: '0 10px', borderRadius: '14px', border: '2px solid var(--ink)', background: 'var(--card)', fontSize: '14px', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{counts[ApplicationStatus.INTERVIEW]}</span>
              <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', fontWeight: 600, color: 'var(--ink2)' }}>
                <span className="live" style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--s3)', flex: '0 0 auto' }}></span>
                <span>In progress</span>
              </span>
            </div>
            {interviews.map((application, index) => (
              <ProgressCard key={application.id} application={application} index={applied.length + 1 + index} />
            ))}
          </section>

          <section style={{ flex: '1 1 auto', minHeight: '220px', background: 'var(--side)', border: '2px solid var(--ink)', borderRadius: '24px', padding: '18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minHeight: '34px' }}>
              <span style={{ width: '18px', height: '18px', borderRadius: '5px', border: '2px solid var(--ink)', background: 'var(--good)', flex: '0 0 auto' }}></span>
              <h2 style={{ margin: 0, fontFamily: 'var(--display)', fontWeight: 700, fontSize: '22px', letterSpacing: '-0.02em', lineHeight: 1.1 }}>Offer</h2>
              <span style={{ minWidth: '32px', height: '28px', padding: '0 10px', borderRadius: '14px', border: '2px solid var(--ink)', background: 'var(--card)', fontSize: '14px', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{counts[ApplicationStatus.OFFER]}</span>
            </div>
            {offers.length > 0 ? (
              offers.map((application, index) => (
                <ProgressCard key={application.id} application={application} index={applied.length + interviews.length + 2 + index} />
              ))
            ) : (
              <div className="trophy-box" style={{ flex: '1 1 auto', border: '2px dashed var(--ink3)', borderRadius: '18px', padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px', textAlign: 'center' }}>
                <svg className="trophy" width="64" height="64" viewBox="0 0 48 48" fill="none" stroke="#1D1A16" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 8h20v12a10 10 0 0 1-20 0z" style={{ fill: 'var(--marker)' }}></path><path d="M14 12H8a5 5 0 0 0 6 7"></path><path d="M34 12h6a5 5 0 0 1-6 7"></path><path d="M24 30v6"></path><path d="M16 42h16"></path><path d="M19 36h10v6H19z" style={{ fill: 'var(--marker)' }}></path></svg>
                <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: '20px', letterSpacing: '-0.02em' }}>No offers yet</div>
                {/* TODO: implement the drag-to-offer interaction this copy describes. */}
                <div style={{ fontSize: '14px', color: 'var(--ink2)', maxWidth: '28ch' }}>Drag a card here when one arrives.</div>
              </div>
            )}
          </section>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', height: '56px', padding: '0 18px', background: 'var(--card)', border: '2px solid var(--ink)', borderRadius: '20px' }}>
            <span style={{ width: '16px', height: '16px', borderRadius: '5px', border: '2px solid var(--ink)', background: 'var(--crit)', flex: '0 0 auto' }}></span>
            <span style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: '18px', letterSpacing: '-0.015em' }}>Rejected</span>
            <span style={{ marginLeft: 'auto', minWidth: '30px', height: '26px', padding: '0 10px', borderRadius: '13px', border: '2px solid var(--ink)', background: 'var(--paper)', fontSize: '14px', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{counts[ApplicationStatus.REJECTED]}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', height: '56px', padding: '0 18px', border: '2px dashed var(--ink3)', borderRadius: '20px', color: 'var(--ink3)' }}>
            <span style={{ width: '16px', height: '16px', borderRadius: '5px', border: '2px solid var(--ink3)', background: 'var(--gray)', flex: '0 0 auto' }}></span>
            <span style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: '18px', letterSpacing: '-0.015em' }}>Withdrawn</span>
            <span style={{ marginLeft: 'auto', minWidth: '30px', height: '26px', padding: '0 10px', borderRadius: '13px', border: '2px dashed var(--ink3)', fontSize: '14px', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{counts[ApplicationStatus.WITHDRAWN]}</span>
          </div>
        </div>
      </div>
    </>
  );
}
