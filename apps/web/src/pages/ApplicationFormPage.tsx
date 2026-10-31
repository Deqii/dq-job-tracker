import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';

import { CompanyCombobox } from '../components/CompanyCombobox';
import { Spinner } from '../components/Spinner';
import { TagInput } from '../components/TagInput';
import { useApplication, useCreateApplication, useUpdateApplication } from '../hooks/useApplications';
import { useCompanies, useCreateCompany } from '../hooks/useCompanies';
import { getErrorMessage } from '../lib/api';
import { STATUS_LABELS, STATUS_ORDER, toISODateInput } from '../lib/utils';
import { applicationSchema, emptyToUndefined } from '../schemas';
import type { ApplicationFormValues } from '../schemas';
import { ApplicationStatus } from '../types';
import type { Company } from '../types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const STATUS_SWATCH: Record<ApplicationStatus, string> = {
  [ApplicationStatus.WISHLIST]: 'var(--gray)',
  [ApplicationStatus.APPLIED]: 'var(--s1)',
  [ApplicationStatus.ASSESSMENT]: 'var(--s2)',
  [ApplicationStatus.INTERVIEW]: 'var(--s3)',
  [ApplicationStatus.OFFER]: 'var(--good)',
  [ApplicationStatus.REJECTED]: 'var(--crit)',
  [ApplicationStatus.WITHDRAWN]: 'var(--gray)',
};

function formatApplied(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return '';
  return `${MONTHS[Number(match[2]) - 1]} ${Number(match[3])}, ${match[1]}`;
}

function defaultValues(): ApplicationFormValues {
  return {
    companyId: '',
    roleTitle: '',
    jobDescription: '',
    postingUrl: '',
    location: '',
    isRemote: false,
    salaryRange: '',
    resumeVersion: '',
    currentStatus: ApplicationStatus.APPLIED,
    appliedAt: toISODateInput(new Date()),
    tags: [],
  };
}

/**
 * After a successful "Save & add another", the per-application fields are
 * cleared while the fields that usually stay identical across a batch
 * (initial status, applied date, resume version) are kept.
 */
function valuesForNextEntry(previous: ApplicationFormValues): ApplicationFormValues {
  return {
    ...previous,
    companyId: '',
    roleTitle: '',
    jobDescription: '',
    postingUrl: '',
    location: '',
    isRemote: false,
    salaryRange: '',
    tags: [],
  };
}

// Safety net: Save is gated by `ready`, but a direct form submit must still render field errors.
function InlineErrorText({ message }: { message?: string }) {
  if (!message) return null;
  return <p role="alert" style={{ margin: '6px 0 0', fontSize: '12.5px', color: 'var(--crit)' }}>{message}</p>;
}

const FIELD_LABELS: Partial<Record<keyof ApplicationFormValues, string>> = {
  companyId: 'Company',
  roleTitle: 'Role title',
  jobDescription: 'Job description',
  postingUrl: 'Posting URL',
  location: 'Location',
  salaryRange: 'Salary range',
  resumeVersion: 'Resume version',
  currentStatus: 'Initial status',
  appliedAt: 'Applied date',
  tags: 'Tags',
  isRemote: 'Remote',
};

function withFieldLabel(field: unknown, message: string): string {
  if (typeof field !== 'string') return message;
  const label = FIELD_LABELS[field as keyof ApplicationFormValues];
  if (!label || message.toLowerCase().includes(label.toLowerCase())) return message;
  return `${label}: ${message}`;
}

function RequirementBadge({ ok }: { ok: boolean }) {
  return (
    <span style={{ padding: '1px 9px', border: '1.5px solid var(--ink)', borderRadius: '999px', background: ok ? 'var(--good)' : 'var(--marker)', color: 'var(--ink)', fontSize: '11.5px', fontWeight: 800 }}>
      {ok ? 'Done' : 'Required'}
    </span>
  );
}

const headingStyle: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--display)',
  fontWeight: 700,
  fontSize: '22px',
  letterSpacing: '-0.02em',
  lineHeight: 1.1,
};

const fieldBoxStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  height: '50px',
  padding: '0 16px',
  background: 'var(--card)',
  border: '2px solid var(--ink)',
  borderRadius: '16px',
};

const inputStyle: CSSProperties = {
  width: '100%',
  height: '100%',
  background: 'transparent',
  border: 0,
  fontSize: '15px',
  color: 'var(--ink)',
};

const fieldLabelStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: '8px', minWidth: 0 };
const labelTextStyle: CSSProperties = { fontSize: '14px', fontWeight: 700 };

type SubmitMode = 'save' | 'saveAndAddAnother';

export function ApplicationFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);

  const navigate = useNavigate();
  const location = useLocation();
  const presetCompanyId = (location.state as { companyId?: string } | null)?.companyId;
  const { data: companies = [], isError: companiesError } = useCompanies();
  const createApplication = useCreateApplication();
  const updateApplication = useUpdateApplication();
  const createCompany = useCreateCompany();
  const applicationQuery = useApplication(id ?? '');

  const [values, setValues] = useState<ApplicationFormValues>(defaultValues);
  const [companyText, setCompanyText] = useState('');
  const [errors, setErrors] = useState<Partial<Record<keyof ApplicationFormValues, string>>>({});
  const [formError, setFormError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [comboboxKey, setComboboxKey] = useState(0);

  const companyInputRef = useRef<HTMLInputElement>(null);
  const companyInputWrapRef = useRef<HTMLDivElement>(null);

  const editingApp = applicationQuery.data;

  useEffect(() => {
    if (!editingApp) return;
    setValues({
      companyId: editingApp.companyId,
      roleTitle: editingApp.roleTitle,
      jobDescription: editingApp.jobDescription,
      postingUrl: editingApp.postingUrl ?? '',
      location: editingApp.location ?? '',
      isRemote: editingApp.isRemote,
      salaryRange: editingApp.salaryRange ?? '',
      resumeVersion: editingApp.resumeVersion ?? '',
      currentStatus: editingApp.currentStatus,
      appliedAt: toISODateInput(new Date(editingApp.appliedAt)),
      tags: (editingApp.tags ?? []).map((tag) => tag.name),
    });
  }, [editingApp]);

  useEffect(() => {
    if (isEdit || !presetCompanyId || values.companyId) return;
    if (companies.some((company) => company.id === presetCompanyId)) {
      setValues((prev) => ({ ...prev, companyId: presetCompanyId }));
    }
  }, [isEdit, presetCompanyId, companies, values.companyId]);

  const setField = <K extends keyof ApplicationFormValues>(key: K, value: ApplicationFormValues[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const handleCreateCompany = async (name: string): Promise<Company> => {
    const created = await createCompany.mutateAsync({ name });
    return created;
  };

  const submit = async (mode: SubmitMode) => {
    setFormError('');
    setSuccessMessage('');

    const parsed = applicationSchema.safeParse(values);
    if (!parsed.success) {
      const next: Partial<Record<keyof ApplicationFormValues, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof ApplicationFormValues;
        if (key && !next[key]) next[key] = issue.message;
      }
      setErrors(next);
      if (next.companyId) companyInputWrapRef.current?.scrollIntoView({ block: 'center' });
      return;
    }

    setSubmitting(true);
    setErrors({});
    try {
      const commonDetails = {
        companyId: parsed.data.companyId,
        roleTitle: parsed.data.roleTitle,
        postingUrl: emptyToUndefined(parsed.data.postingUrl),
        location: emptyToUndefined(parsed.data.location),
        isRemote: parsed.data.isRemote,
        salaryRange: emptyToUndefined(parsed.data.salaryRange),
        resumeVersion: emptyToUndefined(parsed.data.resumeVersion),
        appliedAt: parsed.data.appliedAt
          ? new Date(`${parsed.data.appliedAt}T00:00:00`).toISOString()
          : undefined,
        // The API replaces the tag set whenever this field is present, so the
        // full current selection travels on every save. The edit form seeds it
        // from the loaded application, which keeps untouched tags intact.
        tags: parsed.data.tags,
      };

      if (isEdit && id) {
        const updated = await updateApplication.mutateAsync({ id, input: commonDetails });
        navigate(`/applications/${updated.id}`, { replace: true });
        return;
      }

      const created = await createApplication.mutateAsync({
        ...commonDetails,
        jobDescription: parsed.data.jobDescription,
        currentStatus: parsed.data.currentStatus,
      });

      if (mode === 'saveAndAddAnother') {
        setSuccessMessage(`Saved "${created.roleTitle}". Ready for the next one.`);
        setValues(valuesForNextEntry(parsed.data));
        setCompanyText('');
        setSubmitting(false);
        // The combobox mirrors the selection in its own input state, so remount
        // it to clear the visible text, then return focus to the first field.
        setComboboxKey((previous) => previous + 1);
        companyInputWrapRef.current?.scrollIntoView({ block: 'center' });
        window.setTimeout(() => {
          companyInputRef.current?.focus();
        }, 0);
        return;
      }

      navigate(`/applications/${created.id}`, { replace: true });
    } catch (err) {
      setFormError(getErrorMessage(err));
      setSubmitting(false);
    }
  };

  const validation = useMemo(() => applicationSchema.safeParse(values), [values]);
  const roleOk = values.roleTitle.trim().length > 0 && values.roleTitle.length <= 300;
  const descOk = values.jobDescription.trim().length >= 10 && values.jobDescription.length <= 200_000;
  const ready = validation.success && roleOk && descOk;
  const busy = submitting;

  const doneCount = (roleOk ? 1 : 0) + (descOk ? 1 : 0);
  const pct = doneCount * 50;

  const roleIssue = validation.success
    ? undefined
    : validation.error.issues.find((issue) => issue.path[0] === 'roleTitle');
  const descIssue = validation.success
    ? undefined
    : validation.error.issues.find((issue) => issue.path[0] === 'jobDescription');

  let barMsg: string;
  if (!roleOk && !descOk) {
    barMsg = 'Role title and job description are required';
    } else if (!roleOk) {
    barMsg = roleIssue ? withFieldLabel('roleTitle', roleIssue.message) : 'Role title is required';
  } else if (!descOk) {
    barMsg = descIssue
      ? withFieldLabel('jobDescription', descIssue.message)
      : 'Paste at least 10 characters of the job description';
  } else if (!values.companyId) {
    barMsg = 'Select a company';
  } else if (!validation.success) {
    const issue = validation.error.issues[0];
    barMsg = issue ? withFieldLabel(issue.path[0], issue.message) : 'Check the highlighted fields';
  } else {
    barMsg = 'Ready to save';
  }

  const previewCompany = companyText.trim() || 'Company';
  const previewRole = values.roleTitle.trim() || 'Role title';
  const previewCity = values.location?.trim() || 'Location';
  const appliedText = formatApplied(values.appliedAt ?? '');
  const previewDate =
    values.currentStatus === ApplicationStatus.WISHLIST
      ? 'Not applied yet'
      : appliedText
        ? `Applied ${appliedText}`
        : 'No applied date';

  if (isEdit && applicationQuery.isLoading) {
    return (
      <p style={{ padding: '24px 0', fontSize: '15px', color: 'var(--ink2)' }}>Loading application…</p>
    );
  }
  if (isEdit && applicationQuery.isError) {
    return (
      <p role="alert" style={{ padding: '24px 0', fontSize: '15px', color: 'var(--crit)' }}>
        Could not load this application: {getErrorMessage(applicationQuery.error)}
      </p>
    );
  }

  return (
    <div>
      <header style={{ padding: '22px 0 20px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px 16px' }}>
        <Link
          className="back"
          to={isEdit && id ? `/applications/${id}` : '/applications'}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '10px',
            height: '44px',
            padding: '0 20px 0 16px',
            borderRadius: '22px',
            border: '2px solid var(--ink)',
            background: 'var(--card)',
            fontWeight: 700,
            fontSize: '14px',
          }}
        >
          <span className="arr" style={{ display: 'flex' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5"></path><path d="M12 19l-7-7 7-7"></path></svg>
          </span>
          <span>{isEdit ? 'Back to application' : 'Back to applications'}</span>
        </Link>
      </header>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <h1 style={{ margin: 0, fontFamily: 'var(--display)', fontWeight: 800, fontSize: '52px', lineHeight: 1.02, letterSpacing: '-0.035em', textWrap: 'balance' }}>
          {isEdit ? `Edit ${editingApp?.roleTitle ?? 'application'}` : 'Log a new application'}
        </h1>
        <p style={{ margin: 0, fontSize: '17px', lineHeight: 1.5, color: 'var(--ink2)', maxWidth: '56ch' }}>
          {isEdit
            ? 'The job description is kept exactly as it was the day you applied — it cannot be overwritten.'
            : 'Paste the full posting and pick a company to get it saved in under a minute.'}
        </p>
      </div>

      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (busy) return;
          void submit('save');
        }}
      >
        <div style={{ marginTop: '28px', display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: '24px' }}>
          <section
            style={{
              flex: '1.6 1 560px',
              minWidth: 0,
              background: 'var(--card)',
              border: '2px solid var(--ink)',
              borderRadius: '28px',
              boxShadow: '6px 6px 0 var(--ink)',
              padding: '30px 32px 34px',
              display: 'flex',
              flexDirection: 'column',
              gap: '28px',
            }}
          >
            {successMessage ? (
              <div
                role="status"
                className="pop-now"
                style={{
                  '--r': '-1deg',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '12px 18px',
                  border: '2px solid var(--ink)',
                  borderRadius: '18px',
                  background: 'var(--marker)',
                  boxShadow: '3px 3px 0 var(--ink)',
                  fontWeight: 700,
                } as CSSProperties}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"></path></svg>
                <span>{successMessage}</span>
              </div>
            ) : null}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <h2 style={headingStyle}>Company</h2>
              <p style={{ margin: '0 0 8px', fontSize: '13.5px', lineHeight: 1.5, color: 'var(--ink2)' }}>
                Start typing to filter. A name that does not exist yet can be created inline.
              </p>
              {companiesError ? (
                <p role="alert" style={{ margin: '0 0 8px', fontSize: '12.5px', color: 'var(--crit)' }}>
                  Could not load your companies. Please try again.
                </p>
              ) : null}
              <div ref={companyInputWrapRef}>
                <CompanyCombobox
                  key={comboboxKey}
                  companies={companies}
                  value={values.companyId}
                  onChange={(companyId) => setField('companyId', companyId)}
                  onCreateCompany={handleCreateCompany}
                  onTextChange={setCompanyText}
                  errorMessage={errors.companyId}
                  disabled={busy}
                  inputRef={companyInputRef}
                />
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', paddingTop: '28px', borderTop: '2px dashed var(--line)' }}>
              <h2 style={headingStyle}>Role</h2>
              <label style={fieldLabelStyle}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', fontWeight: 700 }}>
                  <span>Role title</span>
                  <RequirementBadge ok={roleOk} />
                </span>
                <span className="field" style={fieldBoxStyle}>
                  <input
                    id="roleTitle"
                    type="text"
                    value={values.roleTitle}
                    onChange={(event) => setField('roleTitle', event.target.value)}
                    placeholder="e.g. Senior Software Engineer"
                    style={inputStyle}
                  />
                </span>
                <InlineErrorText message={errors.roleTitle} />
              </label>

              <label style={fieldLabelStyle}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', fontWeight: 700 }}>
                  <span>Job description</span>
                  <RequirementBadge ok={descOk} />
                </span>
                {isEdit ? (
                  <span style={{ fontSize: '13.5px', lineHeight: 1.5, color: 'var(--ink2)' }}>
                    The full posting is preserved permanently as a snapshot and cannot be edited after an application is created.
                  </span>
                ) : (
                  <span style={{ fontSize: '13.5px', lineHeight: 1.5, color: 'var(--ink2)' }}>
                    Paste the entire posting text. It&rsquo;s kept forever, even if the listing disappears.
                  </span>
                )}
                <span className="field" style={{ display: 'flex', padding: '14px 16px', background: 'var(--card)', border: '2px solid var(--ink)', borderRadius: '18px' }}>
                  <textarea
                    id="jobDescription"
                    rows={9}
                    value={values.jobDescription}
                    onChange={(event) => setField('jobDescription', event.target.value)}
                    placeholder="Paste the full job description here…"
                    disabled={isEdit}
                    readOnly={isEdit}
                    style={{
                      width: '100%',
                      minHeight: '190px',
                      resize: 'vertical',
                      background: 'transparent',
                      border: 0,
                      fontFamily: "ui-monospace, 'Cascadia Mono', Menlo, Consolas, monospace",
                      fontSize: '13.5px',
                      lineHeight: 1.6,
                      color: 'var(--ink)',
                    }}
                  />
                </span>
                <InlineErrorText message={errors.jobDescription} />
              </label>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', paddingTop: '28px', borderTop: '2px dashed var(--line)' }}>
              <h2 style={headingStyle}>Details</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(240px, 100%), 1fr))', gap: '18px 20px' }}>
                <label style={fieldLabelStyle}>
                  <span style={labelTextStyle}>Posting URL</span>
                  <span className="field" style={fieldBoxStyle}>
                    <input
                      type="text"
                      value={values.postingUrl ?? ''}
                      onChange={(event) => setField('postingUrl', event.target.value)}
                      placeholder="https://..."
                      style={inputStyle}
                    />
                  </span>
                  <InlineErrorText message={errors.postingUrl} />
                </label>
                <label style={fieldLabelStyle}>
                  <span style={labelTextStyle}>Location</span>
                  <span className="field" style={fieldBoxStyle}>
                    <input
                      type="text"
                      value={values.location ?? ''}
                      onChange={(event) => setField('location', event.target.value)}
                      placeholder="e.g. Jakarta"
                      style={inputStyle}
                    />
                  </span>
                  <InlineErrorText message={errors.location} />
                </label>
                <label style={fieldLabelStyle}>
                  <span style={labelTextStyle}>Salary range</span>
                  <span className="field" style={fieldBoxStyle}>
                    <input
                      type="text"
                      value={values.salaryRange ?? ''}
                      onChange={(event) => setField('salaryRange', event.target.value)}
                      placeholder="e.g. Rp 8–12 juta"
                      style={inputStyle}
                    />
                  </span>
                  <InlineErrorText message={errors.salaryRange} />
                </label>
                <label style={fieldLabelStyle}>
                  <span style={labelTextStyle}>Resume version used</span>
                  <span className="field" style={fieldBoxStyle}>
                    <input
                      type="text"
                      value={values.resumeVersion ?? ''}
                      onChange={(event) => setField('resumeVersion', event.target.value)}
                      placeholder="e.g. resume-2026-v2.pdf"
                      style={inputStyle}
                    />
                  </span>
                  <InlineErrorText message={errors.resumeVersion} />
                </label>
              </div>

              <button
                type="button"
                className="rem"
                role="switch"
                aria-checked={values.isRemote}
                aria-label="This role is remote"
                onClick={() => setField('isRemote', !values.isRemote)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '14px', alignSelf: 'flex-start', fontWeight: 700 }}
              >
                <span
                  className="track"
                  style={{
                    position: 'relative',
                    width: '58px',
                    height: '34px',
                    border: '2px solid var(--ink)',
                    borderRadius: '17px',
                    background: values.isRemote ? 'var(--marker)' : 'var(--paper)',
                    flex: '0 0 auto',
                  }}
                >
                  <span
                    className="thumb"
                    style={{
                      position: 'absolute',
                      top: '3px',
                      left: values.isRemote ? '27px' : '3px',
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      border: '2px solid var(--ink)',
                      background: 'var(--card)',
                    }}
                  />
                </span>
                <span>This role is remote</span>
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', paddingTop: '28px', borderTop: '2px dashed var(--line)' }}>
              <h2 style={headingStyle}>Status &amp; tags</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <span style={labelTextStyle}>Initial status</span>
                <div role="group" aria-label="Initial status" style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                  {STATUS_ORDER.map((status) => {
                    const on = status === values.currentStatus;
                    return (
                      <button
                        key={status}
                        type="button"
                        className="stg"
                        aria-pressed={on}
                        disabled={isEdit}
                        onClick={() => setField('currentStatus', status)}
                        style={{
                          height: '42px',
                          padding: '0 16px 0 12px',
                          borderRadius: '21px',
                          border: '2px solid var(--ink)',
                          background: on ? 'var(--ink)' : 'var(--card)',
                          color: on ? 'var(--card)' : 'var(--ink)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          fontWeight: 700,
                          fontSize: '14px',
                        }}
                      >
                        <span
                          style={{
                            width: '16px',
                            height: '16px',
                            borderRadius: '5px',
                            border: `2px solid ${on ? 'var(--card)' : 'var(--ink)'}`,
                            background: STATUS_SWATCH[status],
                            flex: '0 0 auto',
                          }}
                        />
                        <span>{STATUS_LABELS[status]}</span>
                      </button>
                    );
                  })}
                </div>
                {isEdit ? (
                  <span style={{ fontSize: '13px', color: 'var(--ink2)' }}>
                    Status changes are logged from the application page to keep the history intact.
                  </span>
                ) : null}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(240px, 100%), 1fr))', gap: '18px 20px', alignItems: 'start' }}>
                <label style={fieldLabelStyle}>
                  <span style={labelTextStyle}>Applied date</span>
                  <span className="field" style={fieldBoxStyle}>
                    <input
                      type="date"
                      value={values.appliedAt ?? ''}
                      onChange={(event) => setField('appliedAt', event.target.value)}
                      style={{ ...inputStyle, colorScheme: 'light' }}
                    />
                  </span>
                  <InlineErrorText message={errors.appliedAt} />
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: 0 }}>
                  <span style={labelTextStyle}>Tags</span>
                  <TagInput value={values.tags} onChange={(next) => setField('tags', next)} />
                  <InlineErrorText message={errors.tags} />
                </div>
              </div>
            </div>
          </section>

          <aside style={{ flex: '1 1 340px', minWidth: 0, position: 'sticky', top: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <section
              style={{
                background: 'var(--card)',
                border: '2px solid var(--ink)',
                borderRadius: '24px',
                boxShadow: '4px 4px 0 var(--ink)',
                padding: '22px 24px 24px',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '12px' }}>
                <h2 style={headingStyle}>Before you save</h2>
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink2)' }}>{doneCount} of 2 required</span>
              </div>
              <div style={{ height: '12px', borderRadius: '6px', background: 'var(--track)', overflow: 'hidden' }}>
                <div
                  className="meter"
                  style={{ height: '100%', width: `${pct}%`, background: ready ? 'var(--good)' : 'var(--ink)', borderRadius: '6px' }}
                />
              </div>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {[
                  { label: 'Role title', ok: roleOk },
                  { label: 'Job description', ok: descOk },
                ].map((check) => (
                  <li key={check.label} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span
                      style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '9px',
                        border: check.ok ? '2px solid var(--ink)' : '2px dashed var(--ink3)',
                        background: check.ok ? 'var(--good)' : 'var(--card)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flex: '0 0 auto',
                      }}
                    >
                      {check.ok ? (
                        <svg className="pop-now" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1D1A16" strokeWidth="3.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"></path></svg>
                      ) : null}
                    </span>
                    <span style={{ flex: '1 1 auto', fontWeight: 600 }}>{check.label}</span>
                    <span style={{ fontSize: '13px', color: 'var(--ink3)' }}>{check.ok ? 'Done' : 'Required'}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section
              style={{
                background: 'var(--side)',
                border: '2px solid var(--ink)',
                borderRadius: '24px',
                padding: '20px 20px 22px',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <h2 style={headingStyle}>Board preview</h2>
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13.5px', color: 'var(--ink2)' }}>
                  <span style={{ width: '14px', height: '14px', borderRadius: '4px', border: '2px solid var(--ink)', background: STATUS_SWATCH[values.currentStatus], flex: '0 0 auto' }} />
                  <span>Lands in the {STATUS_LABELS[values.currentStatus]} lane</span>
                </span>
              </div>
              <article
                style={{
                  background: 'var(--card)',
                  border: '2px solid var(--ink)',
                  borderRadius: '18px',
                  boxShadow: '3px 3px 0 var(--ink)',
                  padding: '16px 18px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <h3 style={{ margin: 0, fontFamily: 'var(--display)', fontWeight: 700, fontSize: '18px', letterSpacing: '-0.015em', lineHeight: 1.2, overflowWrap: 'anywhere', opacity: values.roleTitle.trim() ? 1 : 0.4 }}>{previewRole}</h3>
                  <div style={{ marginTop: '3px', fontSize: '14px', color: 'var(--ink2)', overflowWrap: 'anywhere', opacity: companyText.trim() ? 1 : 0.4 }}>{previewCompany}</div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 11px 3px 9px', border: '1.5px solid var(--ink)', borderRadius: '999px', fontSize: '12.5px', fontWeight: 600, opacity: values.location?.trim() ? 1 : 0.4 }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                    <span style={{ overflowWrap: 'anywhere' }}>{previewCity}</span>
                  </span>
                  {values.tags.map((tag) => (
                    <span key={tag} className="chip-in" style={{ padding: '3px 11px', border: '1.5px solid var(--ink)', borderRadius: '999px', background: 'var(--paper)', fontSize: '12.5px', fontWeight: 700 }}>#{tag}</span>
                  ))}
                  {values.tags.length === 0 ? (
                    <span style={{ padding: '3px 11px', border: '1.5px dashed var(--ink3)', borderRadius: '999px', fontSize: '12.5px', fontWeight: 600, color: 'var(--ink3)' }}>No tags</span>
                  ) : null}
                  {values.salaryRange?.trim() ? (
                    <span
                      className="pop-now"
                      style={{ '--r': '-2deg', padding: '3px 11px', border: '1.5px solid var(--ink)', borderRadius: '999px', background: 'var(--marker)', fontSize: '12.5px', fontWeight: 700 } as CSSProperties}
                    >
                      {values.salaryRange}
                    </span>
                  ) : null}
                  {values.isRemote ? (
                    <span
                      className="pop-now"
                      style={{ '--r': '2deg', padding: '3px 11px', border: '1.5px solid var(--ink)', borderRadius: '999px', background: 'var(--s1)', fontSize: '12.5px', fontWeight: 700 } as CSSProperties}
                    >
                      Remote
                    </span>
                  ) : null}
                </div>
                <div style={{ paddingTop: '12px', borderTop: '2px dashed var(--line)', fontSize: '13px', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{previewDate}</div>
              </article>
              <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.5, color: 'var(--ink3)' }}>
                This is how the card will look on the board. It updates as you type.
              </p>
            </section>
          </aside>
        </div>

        {formError ? (
          <p role="alert" style={{ margin: '16px 0 0', fontSize: '15px', color: 'var(--crit)' }}>{formError}</p>
        ) : null}

        <div
          style={{
            position: 'sticky',
            bottom: '16px',
            zIndex: 5,
            marginTop: '28px',
            background: 'var(--card)',
            border: '2px solid var(--ink)',
            borderRadius: '24px',
            boxShadow: '6px 6px 0 var(--ink)',
            padding: '14px 18px 14px 24px',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px 16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, fontWeight: 600 }}>
            {ready ? (
              <span
                className="pop-now"
                style={{ width: '26px', height: '26px', borderRadius: '50%', border: '2px solid var(--ink)', background: 'var(--good)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1D1A16" strokeWidth="3.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"></path></svg>
              </span>
            ) : (
              <span style={{ width: '12px', height: '12px', borderRadius: '50%', border: '2px solid var(--ink)', background: 'var(--marker)', flex: '0 0 auto' }} />
            )}
            <span>{barMsg}</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px' }}>
            <Link
              className="hard"
              to={isEdit && id ? `/applications/${id}` : '/applications'}
              style={{
                height: '46px',
                padding: '0 22px',
                borderRadius: '23px',
                border: '2px solid var(--ink)',
                background: 'var(--card)',
                boxShadow: '3px 3px 0 var(--ink)',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              Cancel
            </Link>
            {!isEdit ? (
              <button
                type="button"
                className={ready ? 'hard' : 'off'}
                disabled={!ready || busy || companiesError}
                onClick={() => void submit('saveAndAddAnother')}
                style={{
                  height: '46px',
                  padding: '0 22px',
                  borderRadius: '23px',
                  border: '2px solid var(--ink)',
                  background: 'var(--card)',
                  boxShadow: '3px 3px 0 var(--ink)',
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                {busy ? <Spinner className="h-4 w-4" /> : null}
                Save &amp; add another
              </button>
            ) : null}
            <button
              type="submit"
              className={ready ? 'hard' : 'off'}
              disabled={!ready || busy || companiesError}
              style={
                ready
                  ? ({
                      '--sh': 'var(--marker)',
                      height: '46px',
                      padding: '0 26px',
                      borderRadius: '23px',
                      border: '2px solid var(--ink)',
                      background: 'var(--ink)',
                      color: 'var(--card)',
                      boxShadow: '4px 4px 0 var(--marker)',
                      fontWeight: 700,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                    } as CSSProperties)
                  : { height: '46px', padding: '0 26px', borderRadius: '23px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '8px' }
              }
            >
              {busy ? <Spinner className="h-4 w-4" /> : null}
              {isEdit ? 'Save changes' : 'Save application'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
