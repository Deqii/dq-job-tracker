import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';

import { CompanyCombobox } from '../components/CompanyCombobox';
import { ErrorMessage, InlineError } from '../components/ErrorMessage';
import { FormSection, NativeSelect } from '../components/Select';
import { IconArrowLeft } from '../components/Icons';
import { PageHeader } from '../components/PageHeader';
import { PageLoader, Spinner } from '../components/Spinner';
import { TagInput } from '../components/TagInput';
import { useApplication, useCreateApplication, useUpdateApplication } from '../hooks/useApplications';
import { useCompanies, useCreateCompany } from '../hooks/useCompanies';
import { getErrorMessage } from '../lib/api';
import { STATUS_LABELS, STATUS_ORDER, toISODateInput } from '../lib/utils';
import { applicationSchema, emptyToUndefined } from '../schemas';
import type { ApplicationFormValues } from '../schemas';
import { ApplicationStatus } from '../types';
import type { Company } from '../types';

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
      // Keep focus on the first thing that needs fixing.
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

  if (isEdit && applicationQuery.isLoading) return <PageLoader label="Loading application…" />;
  if (isEdit && applicationQuery.isError) {
    return (
      <ErrorMessage message={`Could not load this application: ${getErrorMessage(applicationQuery.error)}`} />
    );
  }

  const busy = submitting;

  return (
    <div>
      <Link
        to={isEdit && id ? `/applications/${id}` : '/applications'}
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800"
      >
        <IconArrowLeft className="h-4 w-4" />
        {isEdit ? 'Back to application' : 'Back to applications'}
      </Link>

      <PageHeader
        title={isEdit ? `Edit ${editingApp?.roleTitle ?? 'application'}` : 'Log a new application'}
        subtitle={
          isEdit
            ? 'The job description is kept exactly as it was the day you applied — it cannot be overwritten.'
            : 'Paste the full posting and pick a company to get it saved in under a minute.'
        }
      />

      <form
        className="space-y-6"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void submit('save');
        }}
      >
        <div className="card space-y-5 p-5 sm:p-6">
          <FormSection title="Company">
            {companiesError ? (
              <ErrorMessage message="Could not load your companies. Please try again." />
            ) : null}
            <div ref={companyInputWrapRef}>
              <CompanyCombobox
                key={comboboxKey}
                companies={companies}
                value={values.companyId}
                onChange={(companyId) => setField('companyId', companyId)}
                onCreateCompany={handleCreateCompany}
                errorMessage={errors.companyId}
                disabled={busy}
                inputRef={companyInputRef}
              />
            </div>
          </FormSection>

          <FormSection title="Role">
            <div>
              <label htmlFor="roleTitle" className="label">
                Role title <span className="text-rose-500">*</span>
              </label>
              <input
                id="roleTitle"
                className="input"
                value={values.roleTitle}
                onChange={(event) => setField('roleTitle', event.target.value)}
                placeholder="e.g. Senior Software Engineer"
              />
              {errors.roleTitle ? <InlineError message={errors.roleTitle} /> : null}
            </div>

            <div>
              <label htmlFor="jobDescription" className="label">
                Job description <span className="text-rose-500">*</span>
              </label>
              {isEdit ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  The full posting is preserved permanently as a snapshot and cannot be edited after an
                  application is created.
                </div>
              ) : (
                <p className="mb-1.5 text-xs text-slate-500">
                  Paste the entire posting text — it&apos;s kept forever, even if the listing disappears.
                </p>
              )}
              <textarea
                id="jobDescription"
                className="input min-h-[180px] resize-y font-mono text-xs leading-relaxed"
                value={values.jobDescription}
                onChange={(event) => setField('jobDescription', event.target.value)}
                placeholder="Paste the full job description here…"
                disabled={isEdit}
                readOnly={isEdit}
              />
              {errors.jobDescription ? <InlineError message={errors.jobDescription} /> : null}
            </div>
          </FormSection>

          <FormSection title="Details">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="postingUrl" className="label">
                  Posting URL
                </label>
                <input
                  id="postingUrl"
                  type="url"
                  className="input"
                  value={values.postingUrl ?? ''}
                  onChange={(event) => setField('postingUrl', event.target.value)}
                  placeholder="https://…"
                />
                {errors.postingUrl ? <InlineError message={errors.postingUrl} /> : null}
              </div>
              <div>
                <label htmlFor="location" className="label">
                  Location
                </label>
                <input
                  id="location"
                  className="input"
                  value={values.location ?? ''}
                  onChange={(event) => setField('location', event.target.value)}
                  placeholder="e.g. Jakarta"
                />
                {errors.location ? <InlineError message={errors.location} /> : null}
              </div>
              <div>
                <label htmlFor="salaryRange" className="label">
                  Salary range
                </label>
                <input
                  id="salaryRange"
                  className="input"
                  value={values.salaryRange ?? ''}
                  onChange={(event) => setField('salaryRange', event.target.value)}
                  placeholder="e.g. Rp 8–12 juta"
                />
                {errors.salaryRange ? <InlineError message={errors.salaryRange} /> : null}
              </div>
              <div>
                <label htmlFor="resumeVersion" className="label">
                  Resume version used
                </label>
                <input
                  id="resumeVersion"
                  className="input"
                  value={values.resumeVersion ?? ''}
                  onChange={(event) => setField('resumeVersion', event.target.value)}
                  placeholder="e.g. resume-2026-v2.pdf"
                />
                {errors.resumeVersion ? <InlineError message={errors.resumeVersion} /> : null}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                className="h-4 w-4 rounded accent-brand-600"
                checked={values.isRemote}
                onChange={(event) => setField('isRemote', event.target.checked)}
              />
              This role is remote
            </label>
          </FormSection>

          <FormSection title="Status & tags">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="currentStatus" className="label">
                  Initial status
                </label>
                <NativeSelect<ApplicationStatus>
                  value={values.currentStatus}
                  onChange={(next) =>
                    setField('currentStatus', next === '' ? ApplicationStatus.APPLIED : next)
                  }
                  options={STATUS_ORDER.map((value) => ({ value, label: STATUS_LABELS[value] }))}
                  selectProps={{ id: 'currentStatus', name: 'currentStatus', disabled: isEdit }}
                />
                {isEdit ? (
                  <p className="mt-1.5 text-xs text-slate-500">
                    Status changes are logged from the application page to keep the history intact.
                  </p>
                ) : null}
              </div>
              <div>
                <label htmlFor="appliedAt" className="label">
                  Applied date
                </label>
                <input
                  id="appliedAt"
                  type="date"
                  className="input"
                  value={values.appliedAt ?? ''}
                  onChange={(event) => setField('appliedAt', event.target.value)}
                />
                {errors.appliedAt ? <InlineError message={errors.appliedAt} /> : null}
              </div>
            </div>
            <div>
              <span className="label">Tags</span>
              <TagInput value={values.tags} onChange={(next) => setField('tags', next)} />
              {errors.tags ? <InlineError message={errors.tags} /> : null}
            </div>
          </FormSection>
        </div>

        <ErrorMessage message={formError} />
        {successMessage ? (
          <p
            role="status"
            className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700"
          >
            {successMessage}
          </p>
        ) : null}

        <div className="sticky bottom-0 z-10 -mx-4 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Link
              to={isEdit && id ? `/applications/${id}` : '/applications'}
              className="btn btn-secondary btn-md"
            >
              Cancel
            </Link>
            {!isEdit ? (
              <button
                type="button"
                className="btn btn-secondary btn-md"
                disabled={busy || companiesError}
                onClick={() => void submit('saveAndAddAnother')}
              >
                {busy ? <Spinner className="h-4 w-4" /> : null}
                Save &amp; add another
              </button>
            ) : null}
            <button
              type="submit"
              className="btn btn-primary btn-md"
              disabled={busy || (isEdit ? false : companiesError)}
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