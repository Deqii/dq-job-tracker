import { useEffect, useState, type CSSProperties } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { ConfirmDialog } from '../components/ConfirmDialog';
import { ErrorMessage } from '../components/ErrorMessage';
import { PageLoader } from '../components/Spinner';
import {
  useApplication,
  useDeleteApplication,
  useUpdateApplication,
  useUpdateStatus,
} from '../hooks/useApplications';
import { getErrorMessage } from '../lib/api';
import { STATUS_LABELS, STATUS_ORDER, formatDate, formatDateTime, timeAgo } from '../lib/utils';
import { ApplicationStatus } from '../types';

interface StageMeta {
  label: string;
  sw: string;
  bg: string;
  fg: string;
  live: boolean;
}

const STAGE_META: Record<ApplicationStatus, StageMeta> = {
  [ApplicationStatus.WISHLIST]: { label: 'Wishlist', sw: 'var(--gray)', bg: 'var(--track)', fg: 'var(--ink)', live: false },
  [ApplicationStatus.APPLIED]: { label: 'Applied', sw: 'var(--s1)', bg: 'var(--s1)', fg: 'var(--ink)', live: false },
  [ApplicationStatus.ASSESSMENT]: { label: 'Assessment', sw: 'var(--s2)', bg: 'color-mix(in srgb, var(--s2) 85%, black)', fg: '#fff', live: true },
  [ApplicationStatus.INTERVIEW]: { label: 'Interview', sw: 'var(--s3)', bg: 'var(--s3)', fg: '#fff', live: true },
  [ApplicationStatus.OFFER]: { label: 'Offer', sw: 'var(--good)', bg: 'var(--good)', fg: 'var(--ink)', live: false },
  [ApplicationStatus.REJECTED]: { label: 'Rejected', sw: 'var(--crit)', bg: 'var(--crit)', fg: '#fff', live: false },
  [ApplicationStatus.WITHDRAWN]: { label: 'Withdrawn', sw: 'var(--gray)', bg: 'var(--track)', fg: 'var(--ink)', live: false },
};

function formatDuration(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'}`;
}

function Fact({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="fact" style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', minWidth: 0 }}>
      <span className="ico" style={{ flex: '0 0 auto', width: '42px', height: '42px', borderRadius: '50%', border: '2px solid var(--ink)', background: 'var(--paper)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {icon}
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>{label}</div>
        <div style={{ fontSize: '17px', fontWeight: 700 }}>{children}</div>
      </div>
    </div>
  );
}

export function ApplicationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: application, isLoading, isError, error } = useApplication(id ?? '');
  const deleteApplication = useDeleteApplication();
  const updateApplication = useUpdateApplication();
  const updateStatus = useUpdateStatus();

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [tagsEdit, setTagsEdit] = useState<string[]>([]);
  const [tagsSaving, setTagsSaving] = useState(false);
  const [tagDraft, setTagDraft] = useState('');
  const [tagsError, setTagsError] = useState('');
  const [notesEdit, setNotesEdit] = useState('');
  const [notesError, setNotesError] = useState('');
  const [pick, setPick] = useState<ApplicationStatus | null>(null);
  const [statusNote, setStatusNote] = useState('');
  const [statusError, setStatusError] = useState('');
  const [stickerToggle, setStickerToggle] = useState(false);

  useEffect(() => {
    if (application) {
      setTagsEdit(application.tags?.map((tag) => tag.name) ?? []);
      setTagsError('');
      setNotesEdit(application.notes ?? '');
      setNotesError('');
      setPick(null);
      setStatusNote('');
      setStatusError('');
    }
  }, [application, application?.id]);

  if (isLoading) return <PageLoader label="Loading application…" />;

  if (isError || !application) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <Link className="back" to="/applications" style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: '10px', height: '44px', padding: '0 20px 0 16px', borderRadius: '22px', border: '2px solid var(--ink)', background: 'var(--card)', fontWeight: 700, fontSize: '14px' }}>
          <span className="arr" style={{ display: 'flex' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5"></path><path d="M12 19l-7-7 7-7"></path></svg>
          </span>
          <span>Back to applications</span>
        </Link>
        <ErrorMessage message={`Could not load this application: ${getErrorMessage(error)}`} />
      </div>
    );
  }

  const stage = STAGE_META[application.currentStatus];
  const history = [...(application.statusHistory ?? [])].sort(
    (a, b) => new Date(a.changedAt).getTime() - new Date(b.changedAt).getTime(),
  );
  const lastEntry = history[history.length - 1];
  const canUpdate = pick !== null && pick !== application.currentStatus;
  const notesSaved = (application.notes ?? '').trim();
  const notesDirty = notesEdit.trim() !== notesSaved;

  const handleDelete = async () => {
    await deleteApplication.mutateAsync(application.id);
    navigate('/applications', { replace: true });
  };

  const persistTags = async (next: string[]) => {
    if (tagsSaving) return;
    const previous = tagsEdit;
    setTagsEdit(next);
    setTagsSaving(true);
    setTagsError('');
    try {
      await updateApplication.mutateAsync({ id: application.id, input: { tags: next } });
    } catch (err) {
      setTagsEdit(previous);
      setTagsError(getErrorMessage(err));
    } finally {
      setTagsSaving(false);
    }
  };

  const addTag = () => {
    const name = tagDraft.trim();
    setTagDraft('');
    if (tagsSaving || !name || tagsEdit.includes(name)) return;
    void persistTags([...tagsEdit, name]);
  };

  const removeTag = (name: string) => {
    if (tagsSaving) return;
    void persistTags(tagsEdit.filter((tag) => tag !== name));
  };

  const saveNotes = async () => {
    setNotesError('');
    const value = notesEdit.trim();
    try {
      await updateApplication.mutateAsync({ id: application.id, input: { notes: value } });
      setNotesEdit(value);
    } catch (err) {
      setNotesError(getErrorMessage(err));
    }
  };

  const changeStatus = async () => {
    if (!pick) return;
    setStatusError('');
    try {
      await updateStatus.mutateAsync({
        id: application.id,
        input: { status: pick, note: statusNote.trim() || undefined },
      });
      setStatusNote('');
      setPick(null);
      setStickerToggle((value) => !value);
    } catch (err) {
      setStatusError(getErrorMessage(err));
    }
  };

  return (
    <div style={{ '--sticker-base': '300ms' } as CSSProperties}>
      <header style={{ padding: '22px 0 20px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px 16px' }}>
        <Link className="back" to="/applications" style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', height: '44px', padding: '0 20px 0 16px', borderRadius: '22px', border: '2px solid var(--ink)', background: 'var(--card)', fontWeight: 700, fontSize: '14px' }}>
          <span className="arr" style={{ display: 'flex' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5"></path><path d="M12 19l-7-7 7-7"></path></svg>
          </span>
          <span>Back to applications</span>
        </Link>
      </header>

      <section style={{ background: 'var(--card)', border: '2px solid var(--ink)', borderRadius: '28px', boxShadow: '6px 6px 0 var(--ink)', padding: '28px 32px 30px', display: 'flex', flexDirection: 'column', gap: '22px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px 24px' }}>
          <div style={{ flex: '1 1 420px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px 18px' }}>
              <h1 style={{ margin: 0, fontFamily: 'var(--display)', fontWeight: 800, fontSize: '48px', lineHeight: 1.02, letterSpacing: '-0.035em', textWrap: 'balance' }}>{application.roleTitle}</h1>
              <span className={stickerToggle ? 're-a' : 're-b'} style={{ '--r': '-3deg', '--ping': '#fff', display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 14px 5px 12px', border: '2px solid var(--ink)', borderRadius: '999px', boxShadow: '3px 3px 0 var(--ink)', background: stage.bg, color: stage.fg, fontSize: '14px', fontWeight: 800, whiteSpace: 'nowrap' } as CSSProperties}>
                {stage.live ? (
                  <span className="live" style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#fff', flex: '0 0 auto' }}></span>
                ) : null}
                <span>{stage.label}</span>
              </span>
            </div>
            {application.company ? (
              <Link className="lnk" to={`/companies/${application.company.id}`} style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '20px', fontWeight: 600 }}>
                <span>{application.company.name}</span>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 17L17 7"></path><path d="M8 7h9v9"></path></svg>
              </Link>
            ) : null}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
            <Link className="hard" to={`/applications/${application.id}/edit`} style={{ height: '46px', padding: '0 20px', borderRadius: '23px', border: '2px solid var(--ink)', background: 'var(--card)', boxShadow: '3px 3px 0 var(--ink)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
              <span>Edit</span>
            </Link>
            <button type="button" className="hard" onClick={() => setConfirmDelete(true)} style={{ '--sh': 'var(--crit)', height: '46px', padding: '0 20px', borderRadius: '23px', border: '2px solid var(--crit)', background: 'var(--card)', color: 'var(--crit)', boxShadow: '3px 3px 0 var(--crit)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' } as CSSProperties}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><path d="M10 11v6"></path><path d="M14 11v6"></path></svg>
              <span>Delete</span>
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px' }}>
          {tagsEdit.map((tag) => (
            <span key={tag} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', height: '36px', padding: '0 6px 0 14px', border: '2px solid var(--ink)', borderRadius: '18px', background: 'var(--paper)', fontSize: '14px', fontWeight: 700 }}>
              <span>#{tag}</span>
              <button type="button" className="tagx" aria-label={`Remove tag ${tag}`} disabled={tagsSaving} onClick={() => removeTag(tag)} style={{ width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 6L6 18"></path><path d="M6 6l12 12"></path></svg>
              </button>
            </span>
          ))}
          <label className="field tagfield" style={{ flex: '0 1 300px', height: '38px', display: 'flex', alignItems: 'center', padding: '0 16px', border: '2px dashed var(--ink3)', borderRadius: '19px' }}>
            <input
              type="text"
              aria-label="Add a tag"
              placeholder="Type a tag and press Enter"
              value={tagDraft}
              disabled={tagsSaving}
              onChange={(event) => setTagDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ',') {
                  event.preventDefault();
                  addTag();
                }
              }}
              style={{ width: '100%', height: '100%', background: 'transparent', border: 0, fontSize: '14px', color: 'var(--ink)' }}
            />
          </label>
        </div>
        {tagsError ? <ErrorMessage message={tagsError} /> : null}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(240px, 100%), 1fr))', gap: '22px 24px', paddingTop: '22px', borderTop: '2px dashed var(--line)' }}>
          <Fact label="Applied" icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"></rect><path d="M16 2v4"></path><path d="M8 2v4"></path><path d="M3 10h18"></path></svg>}>
            {formatDate(application.appliedAt)}
          </Fact>
          <Fact label="Created" icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path></svg>}>
            {formatDateTime(application.createdAt)}
          </Fact>
          {application.location ? (
            <Fact label="Location" icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>}>
              {application.location}
            </Fact>
          ) : null}
          <Fact label="Remote" icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2"></rect><path d="M2 20h20"></path></svg>}>
            {application.isRemote ? 'Yes' : 'No'}
          </Fact>
          {application.salaryRange ? (
            <Fact label="Salary range" icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2" y="6" width="20" height="12" rx="2"></rect><circle cx="12" cy="12" r="2.5"></circle><path d="M6 12h.01"></path><path d="M18 12h.01"></path></svg>}>
              <span style={{ background: 'linear-gradient(transparent 58%, var(--marker) 58%)', padding: '0 2px' }}>{application.salaryRange}</span>
            </Fact>
          ) : null}
          {application.resumeVersion ? (
            <Fact label="Resume version" icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><path d="M14 2v6h6"></path><path d="M8 13h8"></path><path d="M8 17h8"></path></svg>}>
              {application.resumeVersion}
            </Fact>
          ) : null}
          {application.postingUrl ? (
            <div className="fact" style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'flex-start', gap: '14px', minWidth: 0 }}>
              <span className="ico" style={{ flex: '0 0 auto', width: '42px', height: '42px', borderRadius: '50%', border: '2px solid var(--ink)', background: 'var(--paper)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><path d="M15 3h6v6"></path><path d="M10 14L21 3"></path></svg>
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>Posting</div>
                <a className="lnk" href={application.postingUrl} target="_blank" rel="noreferrer noopener" title={application.postingUrl} style={{ fontSize: '17px', fontWeight: 700, wordBreak: 'break-all' }}>{application.postingUrl}</a>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <section style={{ marginTop: '28px', display: 'flex', flexWrap: 'wrap', alignItems: 'stretch', gap: '24px' }}>
        <div style={{ flex: '1 1 480px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <section style={{ background: 'var(--card)', border: '2px solid var(--ink)', borderRadius: '24px', boxShadow: '4px 4px 0 var(--ink)', padding: '22px 24px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '12px' }}>
              <h2 style={{ margin: 0, fontFamily: 'var(--display)', fontWeight: 700, fontSize: '22px', letterSpacing: '-0.02em', lineHeight: 1.1 }}>Update status</h2>
              <span style={{ fontSize: '13px', color: 'var(--ink3)' }}>Pick the next stage</span>
            </div>
            <div role="group" aria-label="Move to status" style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
              {STATUS_ORDER.map((status) => {
                const meta = STAGE_META[status];
                const isCurrent = status === application.currentStatus;
                const isPick = status === pick;
                return (
                  <button
                    key={status}
                    type="button"
                    className="stg"
                    aria-pressed={isPick}
                    disabled={isCurrent}
                    onClick={() => setPick(isPick ? null : status)}
                    style={{
                      height: '42px',
                      padding: '0 16px 0 12px',
                      borderRadius: '21px',
                      border: isCurrent ? '2px dashed var(--ink)' : '2px solid var(--ink)',
                      background: isCurrent ? 'var(--paper)' : isPick ? 'var(--ink)' : 'var(--card)',
                      color: isPick ? 'var(--card)' : 'var(--ink)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      fontWeight: 700,
                      fontSize: '14px',
                    }}
                  >
                    <span style={{ width: '16px', height: '16px', borderRadius: '5px', border: `2px solid ${isPick ? 'var(--card)' : 'var(--ink)'}`, background: meta.sw, flex: '0 0 auto' }}></span>
                    <span>{meta.label}</span>
                    {isCurrent ? <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink2)' }}>Current</span> : null}
                  </button>
                );
              })}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <span style={{ fontSize: '14px', fontWeight: 700 }}>Note (optional)</span>
              <label className="field" style={{ display: 'flex', background: 'var(--card)', border: '2px solid var(--ink)', borderRadius: '16px', padding: '12px 16px' }}>
                <textarea
                  rows={3}
                  aria-label="Note (optional)"
                  placeholder="e.g. Next round with hiring manager on Thursday"
                  value={statusNote}
                  onChange={(event) => setStatusNote(event.target.value)}
                  disabled={updateStatus.isPending}
                  style={{ width: '100%', minHeight: '84px', resize: 'vertical', background: 'transparent', border: 0, fontSize: '15px', lineHeight: 1.5, color: 'var(--ink)' }}
                />
              </label>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '12px 16px' }}>
              <div style={{ minHeight: '30px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', fontSize: '14px', color: 'var(--ink2)' }}>
                {canUpdate && pick ? (
                  <>
                    <span style={{ padding: '2px 10px', border: '1.5px solid var(--ink)', borderRadius: '999px', background: 'var(--paper)', fontSize: '13px', fontWeight: 700, color: 'var(--ink)' }}>{stage.label}</span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14"></path><path d="M12 5l7 7-7 7"></path></svg>
                    <span style={{ padding: '2px 10px', border: '1.5px solid var(--ink)', borderRadius: '999px', background: 'var(--marker)', fontSize: '13px', fontWeight: 700, color: 'var(--ink)' }}>{STAGE_META[pick].label}</span>
                  </>
                ) : (
                  <span>Nothing selected yet</span>
                )}
              </div>
              <button
                type="button"
                className={canUpdate ? 'hard' : undefined}
                disabled={!canUpdate || updateStatus.isPending}
                onClick={() => void changeStatus()}
                style={{
                  '--sh': 'var(--marker)',
                  height: '46px',
                  padding: '0 26px',
                  borderRadius: '23px',
                  border: canUpdate ? '2px solid var(--ink)' : '2px dashed var(--ink3)',
                  background: canUpdate ? 'var(--ink)' : 'var(--track)',
                  color: canUpdate ? 'var(--card)' : 'var(--ink3)',
                  boxShadow: canUpdate ? '4px 4px 0 var(--marker)' : 'none',
                  fontWeight: 700,
                } as CSSProperties}
              >
                Update
              </button>
            </div>
            {statusError ? <ErrorMessage message={statusError} /> : null}
          </section>

          <section style={{ flex: '1 1 auto', background: 'var(--card)', border: '2px solid var(--ink)', borderRadius: '24px', boxShadow: '4px 4px 0 var(--ink)', padding: '22px 24px 26px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: '4px 12px', marginBottom: '18px' }}>
              <h2 style={{ margin: 0, fontFamily: 'var(--display)', fontWeight: 700, fontSize: '22px', letterSpacing: '-0.02em', lineHeight: 1.1 }}>Status history</h2>
              <span style={{ fontSize: '13px', color: 'var(--ink3)' }}>Last change {lastEntry ? timeAgo(lastEntry.changedAt) : '—'}</span>
            </div>
            {history.length > 0 ? (
              <div style={{ position: 'relative', paddingLeft: '34px' }}>
                <div aria-hidden="true" style={{ position: 'absolute', left: '9px', top: '12px', bottom: '28px', borderLeft: '2px dashed var(--ink)' }}></div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
                  {history.map((entry, index) => {
                    const meta = STAGE_META[entry.status];
                    const next = history[index + 1];
                    const start = new Date(entry.changedAt).getTime();
                    const end = next ? new Date(next.changedAt).getTime() : Date.now();
                    const isLast = index === history.length - 1;
                    const delay = index === 0 ? 450 : index === 1 ? 530 : 0;
                    return (
                      <div key={entry.id} className="hist-in" style={{ '--d': `${delay}ms`, position: 'relative', display: 'flex', flexDirection: 'column', gap: '6px' } as CSSProperties}>
                        <span aria-hidden="true" style={{ position: 'absolute', left: '-34px', top: '3px', width: '20px', height: '20px', borderRadius: '50%', border: '2px solid var(--ink)', background: meta.sw }}></span>
                        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 12px' }}>
                          <span style={{ padding: '2px 12px', border: '2px solid var(--ink)', borderRadius: '999px', background: meta.bg, color: meta.fg, fontSize: '13px', fontWeight: 800 }}>{STATUS_LABELS[entry.status]}</span>
                          <span title={formatDateTime(entry.changedAt)} style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--ink2)' }}>{formatDate(entry.changedAt)}</span>
                        </div>
                        <div style={{ fontSize: '13.5px', color: 'var(--ink3)' }}>
                          {STATUS_LABELS[entry.status]} for {formatDuration(end - start)}
                          {isLast ? ' so far' : ''}
                        </div>
                        {entry.note ? <div style={{ fontSize: '13.5px', color: 'var(--ink3)' }}>{entry.note}</div> : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p style={{ margin: 0, fontSize: '15px', color: 'var(--ink2)' }}>No status change recorded yet.</p>
            )}
          </section>
        </div>

        <div style={{ flex: '1 1 420px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <section style={{ background: 'var(--card)', border: '2px solid var(--ink)', borderRadius: '24px', boxShadow: '4px 4px 0 var(--ink)', padding: '22px 24px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '8px 12px' }}>
              <h2 style={{ margin: 0, fontFamily: 'var(--display)', fontWeight: 700, fontSize: '22px', letterSpacing: '-0.02em', lineHeight: 1.1 }}>Job description</h2>
              <span className="sticker" style={{ '--r': '3deg', '--d': '200ms', padding: '3px 12px', border: '2px solid var(--ink)', borderRadius: '999px', background: 'var(--marker)', fontSize: '12.5px', fontWeight: 800, whiteSpace: 'nowrap' } as CSSProperties}>Original snapshot</span>
            </div>
            <p style={{ margin: 0, fontSize: '13.5px', lineHeight: 1.5, color: 'var(--ink2)', maxWidth: '56ch' }}>Stored verbatim on the day you applied. Never overwritten, even if the listing changed or was removed.</p>
            <div style={{ background: 'var(--paper)', border: '2px dashed var(--ink3)', borderRadius: '18px', padding: '18px 20px', fontSize: '15px', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>
              {application.jobDescription || 'No description was captured for this application.'}
            </div>
          </section>

          <section style={{ flex: '1 1 auto', background: 'var(--card)', border: '2px solid var(--ink)', borderRadius: '24px', boxShadow: '4px 4px 0 var(--ink)', padding: '22px 24px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <h2 style={{ margin: 0, fontFamily: 'var(--display)', fontWeight: 700, fontSize: '22px', letterSpacing: '-0.02em', lineHeight: 1.1 }}>Notes</h2>
              <p style={{ margin: '6px 0 0', fontSize: '13.5px', lineHeight: 1.5, color: 'var(--ink2)' }}>Private to you. Whatever you want to recall before the next step.</p>
            </div>
            <label className="field" style={{ flex: '1 1 auto', minHeight: '150px', display: 'flex', flexDirection: 'column', background: 'var(--card)', border: '2px solid var(--ink)', borderRadius: '16px', padding: '12px 16px' }}>
              <textarea
                aria-label="Notes"
                placeholder="Interviewer names, prep notes, anything to remember…"
                value={notesEdit}
                onChange={(event) => setNotesEdit(event.target.value)}
                style={{ flex: '1 1 auto', width: '100%', minHeight: '120px', resize: 'vertical', background: 'transparent', border: 0, fontSize: '15px', lineHeight: 1.5, color: 'var(--ink)' }}
              />
            </label>
            {notesError ? <ErrorMessage message={notesError} /> : null}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" className="hard" disabled={!notesDirty || updateApplication.isPending} onClick={() => void saveNotes()} style={{ '--sh': 'var(--marker)', height: '46px', padding: '0 24px', borderRadius: '23px', border: '2px solid var(--ink)', background: 'var(--ink)', color: 'var(--card)', boxShadow: '4px 4px 0 var(--marker)', fontWeight: 700 } as CSSProperties}>Save notes</button>
            </div>
          </section>
        </div>
      </section>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete application?"
        message={`This permanently deletes "${application.roleTitle}" at ${application.company?.name ?? 'the company'}, including its status history and tags. The company record itself is kept.`}
        onConfirm={handleDelete}
      />
    </div>
  );
}
