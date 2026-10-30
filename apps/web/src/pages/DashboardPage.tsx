import { useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { useQueries } from '@tanstack/react-query';

import { useAuth } from '../hooks/auth-context';
import { useApplications } from '../hooks/useApplications';
import {
  emptyCounts,
  interviewCountOf,
  interviewRateOf,
  replyCountOf,
  responseRateOf,
  tapeCountsOf,
  useDashboard,
} from '../hooks/useDashboard';
import { easeOutCubic, useCountUp } from '../hooks/useCountUp';
import { api, getErrorMessage } from '../lib/api';
import { STATUS_LABELS, timeAgo } from '../lib/utils';
import { ApplicationStatus } from '../types';
import type { Application, DashboardCounts, StatusHistoryEntry, TagStat } from '../types';
import { ErrorMessage } from '../components/ErrorMessage';
import { PageLoader } from '../components/Spinner';

const TAPE_ORDER: ApplicationStatus[] = [
  ApplicationStatus.WISHLIST,
  ApplicationStatus.APPLIED,
  ApplicationStatus.ASSESSMENT,
  ApplicationStatus.INTERVIEW,
  ApplicationStatus.OFFER,
  ApplicationStatus.REJECTED,
  ApplicationStatus.WITHDRAWN,
];

const LEGEND_ORDER: ApplicationStatus[] = [
  ApplicationStatus.APPLIED,
  ApplicationStatus.ASSESSMENT,
  ApplicationStatus.INTERVIEW,
  ApplicationStatus.OFFER,
  ApplicationStatus.REJECTED,
];

const STATUS_VISUALS: Record<ApplicationStatus, { bg: string; fg: string }> = {
  [ApplicationStatus.WISHLIST]: { bg: 'var(--gray)', fg: '#fff' },
  [ApplicationStatus.APPLIED]: { bg: 'var(--s1)', fg: 'var(--ink)' },
  [ApplicationStatus.ASSESSMENT]: { bg: 'var(--s2)', fg: '#fff' },
  [ApplicationStatus.INTERVIEW]: { bg: 'var(--s3)', fg: '#fff' },
  [ApplicationStatus.OFFER]: { bg: 'var(--good)', fg: '#fff' },
  [ApplicationStatus.REJECTED]: { bg: 'var(--crit)', fg: '#fff' },
  [ApplicationStatus.WITHDRAWN]: { bg: 'var(--gray)', fg: '#fff' },
};

const ROTATIONS = [-2, 1.5, -0.5, 2, -1, 1];

function greetingFor(now: Date): string {
  const hour = now.getHours();
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return count === 1 ? singular : pluralForm;
}

function percentOf(part: number, whole: number): number {
  return whole > 0 ? (part / whole) * 100 : 0;
}

function sourceNote(stat: TagStat): string {
  if (stat.responded === 0 || stat.total === 0) return 'No interviews yet';
  const rate = percentOf(stat.responded, stat.total).toFixed(1);
  return `${stat.responded} ${plural(stat.responded, 'interview')} (${rate}%)`;
}

export function DashboardPage() {
  const { data, isLoading, isError, error } = useDashboard();
  const { user } = useAuth();
  const { data: allApplications } = useApplications();
  const [doneFollowUps, setDoneFollowUps] = useState<Record<string, boolean>>({});
  const progress = useCountUp();
  const eased = easeOutCubic(progress);

  const recent = data?.recentActivity ?? [];
  // TODO(api): GET /api/dashboard omits statusHistory, so this fallback costs one
  // GET /api/applications/:id per recent row (N+1). design/fixtures/dashboard.json
  // includes inline history, so verify:design does not exercise this path.
  const detailQueries = useQueries({
    queries: recent.map((application) => ({
      queryKey: ['application', application.id],
      queryFn: async () => {
        const { data: detail } = await api.get<Application>(`/api/applications/${application.id}`);
        return detail;
      },
      enabled: !application.statusHistory?.length,
    })),
  });

  if (isLoading) return <PageLoader label="Loading your dashboard…" />;

  if (isError || !data) {
    return <ErrorMessage message={`Could not load the dashboard: ${getErrorMessage(error)}`} />;
  }

  const counts: DashboardCounts = data.counts ?? emptyCounts();
  const total = data.total ?? Object.values(counts).reduce((sum, count) => sum + count, 0);
  const replyCount = replyCountOf(counts);
  const interviewCount = interviewCountOf(counts);
  const responseRate = responseRateOf(counts, total) ?? 0;
  const interviewRate = interviewRateOf(counts, total) ?? 0;
  const followUps = data.followUps ?? { count: 0, items: [] };
  const tagStats = data.tagStats ?? [];
  const assessmentCount = counts[ApplicationStatus.ASSESSMENT];
  const interviewStageCount = counts[ApplicationStatus.INTERVIEW];
  const inProgress = assessmentCount + interviewStageCount;
  const offers = counts[ApplicationStatus.OFFER];

  const rawName = user?.email?.split('@')[0] ?? 'there';
  const displayName = rawName ? rawName.charAt(0).toUpperCase() + rawName.slice(1) : 'there';

  const applications = Array.isArray(allApplications) ? allApplications : [];
  const interviews = applications
    .filter((application) => application.currentStatus === ApplicationStatus.INTERVIEW)
    .sort((a, b) => {
      const created = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      return created !== 0 ? created : b.id.localeCompare(a.id);
    });
  const activeInterview = interviews[0] ?? null;

  const historyById = new Map<string, StatusHistoryEntry[]>(
    recent.map((application, index) => [
      application.id,
      application.statusHistory?.length
        ? application.statusHistory
        : (detailQueries[index]?.data?.statusHistory ?? []),
    ]),
  );

  const tapeCounts = tapeCountsOf(counts);
  const tape: Array<{ i: number; r: number; bg: string; isRej: boolean }> = [];
  for (const status of TAPE_ORDER) {
    for (let index = 0; index < tapeCounts[status]; index += 1) {
      tape.push({
        i: tape.length,
        r: ROTATIONS[tape.length % ROTATIONS.length] ?? 0,
        bg: STATUS_VISUALS[status].bg,
        isRej: status === ApplicationStatus.REJECTED,
      });
    }
  }

  const legendStatuses = [
    ...(counts[ApplicationStatus.WISHLIST] > 0 ? [ApplicationStatus.WISHLIST] : []),
    ...LEGEND_ORDER,
    ...(counts[ApplicationStatus.WITHDRAWN] > 0 ? [ApplicationStatus.WITHDRAWN] : []),
  ];
  const legend = legendStatuses.map((status) => ({
    label: STATUS_LABELS[status],
    n: counts[status],
    bg: STATUS_VISUALS[status].bg,
  }));

  const sentWidth = total > 0 ? 88 : 0;
  const funnel = [
    { label: 'Sent', n: total, w: sentWidth, bg: 'var(--s1)', d: 0, note: '' },
    {
      label: 'Replied',
      n: replyCount,
      w: percentOf(replyCount, total) * 0.88,
      bg: 'var(--s2)',
      d: 90,
      note: `${responseRate.toFixed(1)}% of sent`,
    },
    {
      label: 'Interview',
      n: interviewCount,
      w: percentOf(interviewCount, total) * 0.88,
      bg: 'var(--s3)',
      d: 180,
      note:
        replyCount > 0
          ? `${Math.round(percentOf(interviewCount, replyCount))}% of replies`
          : 'no replies yet',
    },
    {
      label: 'Offer',
      n: offers,
      w: percentOf(offers, total) * 0.88,
      bg: 'var(--good)',
      d: 270,
      note: offers > 0 && replyCount > 0 ? `${Math.round(percentOf(offers, replyCount))}% of replies` : 'none yet',
    },
  ];

  const maxSource = Math.max(1, ...tagStats.map((stat) => stat.total));
  const offerNote =
    offers > 0
      ? `${inProgress} are in progress.`
      : `None yet. ${inProgress} are in progress.`;

  return (
    <div>
      <header style={{ padding: '20px 0', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px 16px' }}>
        {/* TODO: dashboard search has no behavior yet. */}
        <label className="field" style={{ flex: '1 1 280px', maxWidth: '520px', height: '48px', display: 'flex', alignItems: 'center', gap: '10px', padding: '0 18px', background: 'var(--card)', border: '2px solid var(--ink)', borderRadius: '24px', color: 'var(--ink3)' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="M21 21l-4.3-4.3"></path></svg>
          <input type="text" aria-label="Search companies, roles, notes" placeholder="Search companies, roles, notes" style={{ flex: '1 1 auto', minWidth: 0, height: '100%', background: 'transparent', border: 0, fontSize: '15px', color: 'var(--ink)' }} />
          <span style={{ fontSize: '11.5px', fontWeight: 600, border: '1.5px solid var(--ink3)', borderRadius: '7px', padding: '2px 7px', color: 'var(--ink3)' }}>Ctrl K</span>
        </label>
        {/* TODO: notifications have no model in the app yet. */}
        <button type="button" className="hard" aria-label="Notifications" style={{ marginLeft: 'auto', width: '48px', height: '48px', borderRadius: '50%', border: '2px solid var(--ink)', background: 'var(--card)', boxShadow: '3px 3px 0 var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"></path><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"></path></svg>
        </button>
        <Link className="hard" to="/applications/new" style={{ '--sh': 'var(--marker)', height: '48px', padding: '0 22px', borderRadius: '24px', border: '2px solid var(--ink)', background: 'var(--ink)', color: 'var(--card)', boxShadow: '4px 4px 0 var(--sh)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' } as CSSProperties}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5v14"></path><path d="M5 12h14"></path></svg>
          <span>New application</span>
        </Link>
      </header>

      <section style={{ marginTop: '4px', background: 'var(--marker)', border: '2px solid var(--ink)', borderRadius: '28px', boxShadow: '6px 6px 0 var(--ink)', padding: '34px 36px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '28px 40px' }}>
        <div style={{ flex: '1 1 520px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <h1 style={{ margin: 0, fontFamily: 'var(--display)', fontWeight: 800, fontSize: '60px', lineHeight: 1, letterSpacing: '-0.035em', textWrap: 'balance' }}>{greetingFor(new Date())}, {displayName}.</h1>
          <p style={{ margin: 0, fontSize: '17px', lineHeight: 1.5, color: 'var(--ink2)', maxWidth: '40ch', textWrap: 'pretty' }}>
            {followUps.count} {plural(followUps.count, 'application')} {followUps.count === 1 ? 'is' : 'are'} waiting on a follow-up. {inProgress} are in progress: {assessmentCount} {plural(assessmentCount, 'assessment')}, {interviewStageCount} {plural(interviewStageCount, 'interview')}.
          </p>
          {/* TODO: quick add does not parse links or create an application yet. */}
          <div style={{ display: 'flex', gap: '12px', maxWidth: '480px', marginTop: '4px' }}>
            <label className="field" style={{ flex: '1 1 auto', minWidth: 0, height: '52px', display: 'flex', alignItems: 'center', padding: '0 20px', background: 'var(--card)', border: '2px solid var(--ink)', borderRadius: '26px' }}>
              <input type="text" aria-label="Paste a job link or type a company" placeholder="Paste a job link or type a company" style={{ width: '100%', height: '100%', background: 'transparent', border: 0, fontSize: '15px', color: 'var(--ink)' }} />
            </label>
            <button type="button" className="hard" style={{ '--sh': 'var(--card)', height: '52px', padding: '0 24px', borderRadius: '26px', border: '2px solid var(--ink)', background: 'var(--ink)', color: 'var(--card)', boxShadow: '4px 4px 0 var(--sh)', fontWeight: 700 } as CSSProperties}>Add</button>
          </div>
        </div>

        <div style={{ flex: '1 1 360px', minWidth: 0, background: 'var(--card)', border: '2px solid var(--ink)', borderRadius: '22px', padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: '4px 12px' }}>
            <span style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: '18px', letterSpacing: '-0.015em' }}>Where your {total} applications stand</span>
            <span style={{ fontSize: '13px', color: 'var(--ink3)' }}>One cell per application</span>
          </div>
          <div aria-hidden="true" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {tape.map((cell) => (
              <div key={cell.i} className="stamp" style={{ '--i': cell.i, '--r': `${cell.r}deg`, width: '30px', height: '30px', borderRadius: '9px', border: '2px solid var(--ink)', background: cell.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' } as CSSProperties}>
                {cell.isRej ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 6L6 18"></path><path d="M6 6l12 12"></path></svg>
                ) : null}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {legend.map((entry) => (
              <div key={entry.label} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 12px 4px 8px', border: '1.5px solid var(--ink)', borderRadius: '999px', background: 'var(--card)', fontSize: '13px', fontWeight: 600 }}>
                <span style={{ width: '14px', height: '14px', borderRadius: '4px', background: entry.bg }}></span>
                <span>{entry.label}</span>
                <span style={{ fontWeight: 800 }}>{entry.n}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section aria-label="Key numbers" style={{ marginTop: '32px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(240px, 100%), 1fr))', gap: '20px' }}>
        <div style={{ background: 'var(--card)', border: '2px solid var(--ink)', borderRadius: '20px', boxShadow: '4px 4px 0 var(--ink)', padding: '18px 22px 20px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink2)' }}>Applications sent</span>
          <span style={{ fontFamily: 'var(--display)', fontWeight: 800, fontSize: '56px', lineHeight: 1.05, letterSpacing: '-0.035em' }}>{Math.round(total * eased)}</span>
          <span style={{ fontSize: '13.5px', color: 'var(--ink3)' }}>{counts[ApplicationStatus.APPLIED]} waiting for a reply</span>
        </div>
        <div style={{ background: 'var(--card)', border: '2px solid var(--ink)', borderRadius: '20px', boxShadow: '4px 4px 0 var(--ink)', padding: '18px 22px 20px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink2)' }}>Response rate</span>
          <span style={{ fontFamily: 'var(--display)', fontWeight: 800, fontSize: '56px', lineHeight: 1.05, letterSpacing: '-0.035em' }}>{(responseRate * eased).toFixed(1)}%</span>
          <div style={{ height: '12px', borderRadius: '6px', background: '#DDE4FF', margin: '4px 0', overflow: 'hidden' }}>
            <div className="bar" style={{ height: '100%', width: `${Math.min(100, responseRate)}%`, background: 'var(--s2)', borderRadius: '6px' }}></div>
          </div>
          <span style={{ fontSize: '13.5px', color: 'var(--ink3)' }}>{replyCount} of {total} replied (any answer)</span>
        </div>
        <div style={{ background: 'var(--card)', border: '2px solid var(--ink)', borderRadius: '20px', boxShadow: '4px 4px 0 var(--ink)', padding: '18px 22px 20px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink2)' }}>Interview rate</span>
          <span style={{ fontFamily: 'var(--display)', fontWeight: 800, fontSize: '56px', lineHeight: 1.05, letterSpacing: '-0.035em' }}>{(interviewRate * eased).toFixed(1)}%</span>
          <div style={{ height: '12px', borderRadius: '6px', background: '#DDE4FF', margin: '4px 0', overflow: 'hidden' }}>
            <div className="bar" style={{ height: '100%', width: `${Math.min(100, interviewRate)}%`, background: 'var(--s2)', borderRadius: '6px' }}></div>
          </div>
          <span style={{ fontSize: '13.5px', color: 'var(--ink3)' }}>{interviewCount} of {total} reached interview</span>
        </div>
        <div style={{ border: '2px dashed var(--ink)', borderRadius: '20px', padding: '18px 22px 20px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink2)' }}>Offers</span>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
            <span style={{ fontFamily: 'var(--display)', fontWeight: 800, fontSize: '56px', lineHeight: 1.05, letterSpacing: '-0.035em' }}>{offers}</span>
            <svg width="56" height="56" viewBox="0 0 48 48" fill="none" stroke="#1D1A16" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 8h20v12a10 10 0 0 1-20 0z" style={{ fill: 'var(--marker)' }}></path><path d="M14 12H8a5 5 0 0 0 6 7"></path><path d="M34 12h6a5 5 0 0 1-6 7"></path><path d="M24 30v6"></path><path d="M16 42h16"></path><path d="M19 36h10v6H19z" style={{ fill: 'var(--marker)' }}></path></svg>
          </div>
          <span style={{ fontSize: '13.5px', color: 'var(--ink3)' }}>{offerNote}</span>
        </div>
      </section>

      <section style={{ marginTop: '28px', display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: '24px' }}>
        <div style={{ flex: '1.2 1 520px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <section style={{ background: 'var(--card)', border: '2px solid var(--ink)', borderRadius: '24px', boxShadow: '4px 4px 0 var(--ink)', padding: '22px 24px' }}>
            <h2 style={{ margin: '0 0 16px', fontFamily: 'var(--display)', fontWeight: 700, fontSize: '22px', letterSpacing: '-0.02em', lineHeight: 1.1 }}>From sent to offer</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {funnel.map((row) => (
                <div key={row.label} style={{ display: 'grid', gridTemplateColumns: '84px minmax(0, 1fr)', alignItems: 'center', gap: '12px', height: '40px' }}>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink2)' }}>{row.label}</span>
                  <div style={{ position: 'relative', height: '28px', borderLeft: '2px solid var(--ink)' }}>
                    <div className="bar" style={{ '--d': `${row.d}ms`, position: 'absolute', left: 0, top: '2px', height: '24px', width: `${row.w}%`, background: row.bg, borderRadius: '0 4px 4px 0' } as CSSProperties}></div>
                    <div className="fade" style={{ '--d': `${row.d}ms`, position: 'absolute', top: 0, height: '28px', left: `calc(${row.w}% + 12px)`, display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap' } as CSSProperties}>
                      <span style={{ fontSize: '16px', fontWeight: 800 }}>{row.n}</span>
                      <span style={{ fontSize: '13px', color: 'var(--ink3)' }}>{row.note}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <p style={{ margin: '14px 0 0', fontSize: '13px', color: 'var(--ink3)' }}>Replied counts any answer, including a rejection.</p>
          </section>

          <section style={{ background: 'var(--card)', border: '2px solid var(--ink)', borderRadius: '24px', boxShadow: '4px 4px 0 var(--ink)', padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span className="live" style={{ width: '12px', height: '12px', borderRadius: '50%', background: 'var(--s3)', flex: '0 0 auto' }}></span>
              <h2 style={{ margin: 0, fontFamily: 'var(--display)', fontWeight: 700, fontSize: '22px', letterSpacing: '-0.02em', lineHeight: 1.1 }}>Interview in progress</h2>
            </div>
            {activeInterview ? (
              <>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px 16px' }}>
                  <div style={{ minWidth: 0 }}>
                    <Link className="lnk" to={`/applications/${activeInterview.id}`} style={{ display: 'inline-block', fontFamily: 'var(--display)', fontWeight: 800, fontSize: '30px', letterSpacing: '-0.03em', lineHeight: 1.08 }}>{activeInterview.company?.name}</Link>
                    <div style={{ marginTop: '4px', fontSize: '16px', color: 'var(--ink2)' }}>{activeInterview.roleTitle}</div>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 12px 4px 10px', border: '1.5px solid var(--ink)', borderRadius: '999px', fontSize: '13px', fontWeight: 600 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                      <span>{activeInterview.location ?? '—'}</span>
                    </span>
                    {activeInterview.salaryRange ? (
                      <span className="sticker" style={{ '--r': '-3deg', '--d': '200ms', padding: '4px 12px', border: '2px solid var(--ink)', borderRadius: '999px', background: 'var(--marker)', fontSize: '13px', fontWeight: 700 } as CSSProperties}>{activeInterview.salaryRange}</span>
                    ) : null}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '12px 0', borderTop: '2px dashed var(--line)' }}>
                    <span style={{ display: 'flex', color: 'var(--ink2)' }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"></rect><path d="M16 2v4"></path><path d="M8 2v4"></path><path d="M3 10h18"></path></svg></span>
                    <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                      <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>Schedule</div>
                      <div style={{ fontWeight: 700 }}>Not set</div>
                    </div>
                    {/* TODO: the application model has no schedule field. */}
                    <button type="button" className="hard" style={{ height: '44px', padding: '0 18px', borderRadius: '22px', border: '2px solid var(--ink)', background: 'var(--card)', boxShadow: '3px 3px 0 var(--ink)', fontWeight: 700, fontSize: '14px' }}>Set schedule</button>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '12px 0 0', borderTop: '2px dashed var(--line)' }}>
                    <span style={{ display: 'flex', color: 'var(--ink2)' }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg></span>
                    <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                      <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>Prep notes</div>
                      <div style={{ fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{activeInterview.notes?.trim() ? activeInterview.notes : 'Empty'}</div>
                    </div>
                    <Link className="hard" to={`/applications/${activeInterview.id}`} style={{ height: '44px', padding: '0 18px', borderRadius: '22px', border: '2px solid var(--ink)', background: 'var(--card)', boxShadow: '3px 3px 0 var(--ink)', fontWeight: 700, fontSize: '14px', display: 'flex', alignItems: 'center' }}>Write notes</Link>
                  </div>
                </div>
              </>
            ) : (
              /* TODO(legacy): minimal empty state replaces the old styled empty state. */
              <p style={{ margin: 0, fontSize: '13.5px', color: 'var(--ink3)' }}>No interviews in progress.</p>
            )}
          </section>

          <section style={{ background: 'var(--card)', border: '2px solid var(--ink)', borderRadius: '24px', boxShadow: '4px 4px 0 var(--ink)', padding: '22px 24px' }}>
            <h2 style={{ margin: '0 0 16px', fontFamily: 'var(--display)', fontWeight: 700, fontSize: '22px', letterSpacing: '-0.02em', lineHeight: 1.1 }}>Sources</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {tagStats.length > 0 ? (
                tagStats.map((source) => (
                  <div key={source.name} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '12px' }}>
                      <span style={{ fontWeight: 700, fontSize: '16px' }}>{source.name}</span>
                      <span style={{ display: 'flex', alignItems: 'baseline', gap: '6px', fontSize: '13.5px', color: 'var(--ink2)' }}>
                        <span style={{ fontSize: '16px', fontWeight: 800, color: 'var(--ink)' }}>{source.total}</span>
                        <span>applications</span>
                      </span>
                    </div>
                    <div style={{ height: '12px', borderRadius: '6px', background: 'var(--track)', overflow: 'hidden' }}>
                      <div className="bar" style={{ height: '100%', width: `${percentOf(source.total, maxSource)}%`, background: 'var(--gray)', borderRadius: '6px' }}></div>
                    </div>
                    <span style={{ fontSize: '13.5px', color: 'var(--ink3)' }}>{sourceNote(source)}</span>
                  </div>
                ))
              ) : (
                /* TODO(legacy): minimal empty state replaces the old styled empty state. */
                <p style={{ margin: 0, fontSize: '13.5px', color: 'var(--ink3)' }}>Add tags to your applications to compare sources</p>
              )}
            </div>
          </section>
        </div>

        <div style={{ flex: '1 1 440px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <section style={{ background: 'var(--card)', border: '2px solid var(--ink)', borderRadius: '24px', boxShadow: '4px 4px 0 var(--ink)', padding: '22px 24px 8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <h2 style={{ margin: 0, fontFamily: 'var(--display)', fontWeight: 700, fontSize: '22px', letterSpacing: '-0.02em', lineHeight: 1.1 }}>Needs follow-up</h2>
              <span className="sticker" style={{ '--r': '-4deg', '--d': '100ms', minWidth: '32px', height: '26px', padding: '0 10px', borderRadius: '13px', border: '2px solid var(--ink)', background: 'var(--marker)', fontSize: '14px', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' } as CSSProperties}>{followUps.count}</span>
              <Link className="lnk" to="/applications" style={{ marginLeft: 'auto', fontSize: '14px', fontWeight: 700 }}>See all</Link>
            </div>
            {/* TODO(copy): the app has no ghosted status and follows up after 14 days, not 30. */}
            <p style={{ margin: '8px 0 8px', fontSize: '13px', color: 'var(--ink3)', maxWidth: '52ch' }}>Bars fill toward day 30, when an application is marked ghosted.</p>
            {followUps.items.length > 0 ? (
              <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                {followUps.items.map((row, index) => {
                  const isDone = Boolean(doneFollowUps[row.id]);
                  const daysPct = Math.min(100, (row.daysWaiting / 30) * 100);
                  return (
                    <li key={row.id} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '12px 0', borderTop: '2px dashed var(--line)' }}>
                      <Link className="dim-t" to={`/applications/${row.id}`} style={{ flex: '1 1 auto', minWidth: 0, opacity: isDone ? 0.45 : 1 }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: '17px', letterSpacing: '-0.01em', lineHeight: 1.2 }}>{row.companyName}</div>
                            <div style={{ fontSize: '13.5px', color: 'var(--ink2)' }}>{row.roleTitle}</div>
                          </div>
                          <span style={{ fontSize: '13px', fontWeight: 700, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{row.daysWaiting} {plural(row.daysWaiting, 'day')}</span>
                        </div>
                        <div style={{ height: '10px', borderRadius: '5px', background: 'var(--track)', marginTop: '10px', overflow: 'hidden' }}>
                          <div className="bar" style={{ '--d': `${600 + index * 55}ms`, height: '100%', width: `${daysPct}%`, background: 'var(--ink)', borderRadius: '5px' } as CSSProperties}></div>
                        </div>
                      </Link>
                      {/* TODO: done state is local only and resets on reload. */}
                      <button type="button" className="btn-fu" onClick={() => setDoneFollowUps((current) => ({ ...current, [row.id]: !current[row.id] }))} style={{ flex: '0 0 auto', width: '124px', height: '44px', borderRadius: '22px', border: '2px solid var(--ink)', fontWeight: 700, fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', background: isDone ? 'var(--ink)' : 'var(--card)', color: isDone ? 'var(--card)' : 'var(--ink)', boxShadow: isDone ? 'none' : '3px 3px 0 var(--ink)' }}>
                        {isDone ? (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"></path></svg>
                        ) : (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 2L11 13"></path><path d="M22 2l-7 20-4-9-9-4 20-7z"></path></svg>
                        )}
                        <span>{isDone ? 'Done' : 'Follow up'}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              /* TODO(legacy): minimal empty state replaces the old styled empty state. */
              <p style={{ margin: '8px 0 8px', fontSize: '13.5px', color: 'var(--ink3)' }}>Nothing to follow up on yet.</p>
            )}
          </section>

          <section style={{ background: 'var(--card)', border: '2px solid var(--ink)', borderRadius: '24px', boxShadow: '4px 4px 0 var(--ink)', padding: '22px 24px 8px' }}>
            <h2 style={{ margin: '0 0 8px', fontFamily: 'var(--display)', fontWeight: 700, fontSize: '22px', letterSpacing: '-0.02em', lineHeight: 1.1 }}>Recent activity</h2>
            {recent.length > 0 ? (
              <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                {recent.map((application) => {
                  const history = historyById.get(application.id) ?? [];
                  const initialStatus = history[0]?.status ?? application.currentStatus;
                  const currentStatus = application.currentStatus;
                  const isMove = initialStatus !== currentStatus;
                  const initialVisual = STATUS_VISUALS[initialStatus];
                  const currentVisual = STATUS_VISUALS[currentStatus];
                  const flag = new Date(application.appliedAt).getTime() > Date.now();
                  return (
                    <li key={application.id} style={{ borderTop: '2px dashed var(--line)' }}>
                      <Link to={`/applications/${application.id}`} style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', padding: '12px 0' }}>
                        <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                          <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: '17px', letterSpacing: '-0.01em', lineHeight: 1.2 }}>{application.company?.name}</div>
                          <div style={{ marginTop: '4px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '6px 12px' }}>
                            <span style={{ fontSize: '13.5px', color: 'var(--ink2)' }}>{application.roleTitle}</span>
                            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px' }}>
                              <span style={{ padding: '2px 10px', border: '1.5px solid var(--ink)', borderRadius: '999px', background: initialVisual.bg, color: initialVisual.fg, fontSize: '12.5px', fontWeight: 700 }}>{STATUS_LABELS[initialStatus]}</span>
                              {isMove ? (
                                <>
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14"></path><path d="M12 5l7 7-7 7"></path></svg>
                                  <span style={{ padding: '2px 10px', border: '1.5px solid var(--ink)', borderRadius: '999px', background: currentVisual.bg, color: currentVisual.fg, fontSize: '12.5px', fontWeight: 700 }}>{STATUS_LABELS[currentStatus]}</span>
                                </>
                              ) : null}
                              {flag ? (
                                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '2px 10px 2px 8px', border: '1.5px solid var(--ink)', borderRadius: '999px', background: 'var(--marker)', fontSize: '12.5px', fontWeight: 700 }}>
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><path d="M12 9v4"></path><path d="M12 17h.01"></path></svg>
                                  <span>Future date, please check</span>
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>
                        <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink2)', whiteSpace: 'nowrap', paddingTop: '2px', fontVariantNumeric: 'tabular-nums' }}>{timeAgo(application.createdAt)}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              /* TODO(legacy): minimal empty state replaces the old styled empty state. */
              <p style={{ margin: '8px 0 8px', fontSize: '13.5px', color: 'var(--ink3)' }}>
                Nothing here yet. <Link className="lnk" to="/applications/new">Log your first application</Link> to start building your search history.
              </p>
            )}
          </section>
        </div>
      </section>
    </div>
  );
}
