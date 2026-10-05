import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { FormEvent } from 'react';

import { ErrorMessage, InlineError } from '../components/ErrorMessage';
import { IconArrowLeft } from '../components/Icons';
import { PageHeader } from '../components/PageHeader';
import { PageLoader, Spinner } from '../components/Spinner';
import { useCompanies, useCreateCompany, useUpdateCompany } from '../hooks/useCompanies';
import { getErrorMessage } from '../lib/api';
import { emptyToUndefined } from '../schemas';
import { companySchema } from '../schemas';
import type { CompanyValues } from '../schemas';

function blank(): CompanyValues {
  return { name: '', website: '', industry: '', notes: '' };
}

export function CompanyFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const { data: companies = [], isLoading, isError } = useCompanies();
  const createCompany = useCreateCompany();
  const updateCompany = useUpdateCompany();

  const editingCompany = id ? companies.find((company) => company.id === id) : undefined;

  const [values, setValues] = useState<CompanyValues>(blank);
  const [errors, setErrors] = useState<Partial<Record<keyof CompanyValues, string>>>({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!editingCompany) return;
    setValues({
      name: editingCompany.name,
      website: editingCompany.website ?? '',
      industry: editingCompany.industry ?? '',
      notes: editingCompany.notes ?? '',
    });
  }, [editingCompany]);

  const setField = <K extends keyof CompanyValues>(key: K, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError('');
    const parsed = companySchema.safeParse(values);
    if (!parsed.success) {
      const next: Partial<Record<keyof CompanyValues, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof CompanyValues;
        if (key && !next[key]) next[key] = issue.message;
      }
      setErrors(next);
      return;
    }

    setSubmitting(true);
    try {
      const input = {
        name: parsed.data.name,
        website: emptyToUndefined(parsed.data.website),
        industry: emptyToUndefined(parsed.data.industry),
        notes: emptyToUndefined(parsed.data.notes),
      };
      if (isEdit && id) {
        await updateCompany.mutateAsync({ id, input });
        navigate(`/companies/${id}`, { replace: true });
      } else {
        const created = await createCompany.mutateAsync(input);
        navigate(`/companies/${created.id}`, { replace: true });
      }
    } catch (err) {
      setFormError(getErrorMessage(err));
      setSubmitting(false);
    }
  };

  if (isEdit && isLoading) return <PageLoader label="Loading company…" />;
  if (isEdit && (isError || !editingCompany)) {
    return (
      <div>
        <Link
          to="/companies"
          className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800"
        >
          <IconArrowLeft className="h-4 w-4" />
          Back to companies
        </Link>
        <ErrorMessage message="This company could not be found." />
      </div>
    );
  }

  return (
    <div>
      <Link
        to={isEdit && id ? `/companies/${id}` : '/companies'}
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800"
      >
        <IconArrowLeft className="h-4 w-4" />
        {isEdit ? 'Back to company' : 'Back to companies'}
      </Link>

      <PageHeader
        title={isEdit ? `Edit ${editingCompany?.name ?? 'company'}` : 'Add a company'}
        subtitle="Keep basic details about the companies you’re targeting."
      />

      <form onSubmit={(event) => void handleSubmit(event)} className="card max-w-2xl space-y-4 p-5 sm:p-6" noValidate>
        <div>
          <label htmlFor="name" className="label">
            Company name <span className="text-rose-500">*</span>
          </label>
          <input
            id="name"
            className="input"
            value={values.name}
            onChange={(event) => setField('name', event.target.value)}
            placeholder="e.g. Acme Corporation"
          />
          {errors.name ? <InlineError message={errors.name} /> : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="website" className="label">
              Website
            </label>
            <input
              id="website"
              type="url"
              className="input"
              value={values.website ?? ''}
              onChange={(event) => setField('website', event.target.value)}
              placeholder="https://acme.example.com"
            />
            {errors.website ? <InlineError message={errors.website} /> : null}
          </div>
          <div>
            <label htmlFor="industry" className="label">
              Industry
            </label>
            <input
              id="industry"
              className="input"
              value={values.industry ?? ''}
              onChange={(event) => setField('industry', event.target.value)}
              placeholder="e.g. Fintech"
            />
            {errors.industry ? <InlineError message={errors.industry} /> : null}
          </div>
        </div>

        <div>
          <label htmlFor="notes" className="label">
            Notes
          </label>
          <textarea
            id="notes"
            className="input min-h-[110px] resize-y"
            value={values.notes ?? ''}
            onChange={(event) => setField('notes', event.target.value)}
            placeholder="Contacts, hiring process quirks, anything you want to remember…"
          />
          {errors.notes ? <InlineError message={errors.notes} /> : null}
        </div>

        <ErrorMessage message={formError} />

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <Link
            to={isEdit && id ? `/companies/${id}` : '/companies'}
            className="btn btn-secondary btn-md"
          >
            Cancel
          </Link>
          <button type="submit" className="btn btn-primary btn-md" disabled={submitting}>
            {submitting ? <Spinner className="h-4 w-4" /> : null}
            {isEdit ? 'Save changes' : 'Add company'}
          </button>
        </div>
      </form>
    </div>
  );
}