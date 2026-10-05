import { useState } from 'react';
import type { FormEvent } from 'react';

import { ErrorMessage, InlineError } from '../components/ErrorMessage';
import { EmptyState } from '../components/EmptyState';
import { IconPlus, IconTag } from '../components/Icons';
import { PageHeader } from '../components/PageHeader';
import { Spinner } from '../components/Spinner';
import { coloredTagClass } from '../lib/utils';
import { useTags, useCreateTag } from '../hooks/useTags';
import { getErrorMessage } from '../lib/api';
import { tagSchema } from '../schemas';

export function TagsPage() {
  const { data: tags = [], isLoading, isError, error } = useTags();
  const createTag = useCreateTag();
  const [name, setName] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [formError, setFormError] = useState('');

  const sorted = [...tags].sort((a, b) => a.name.localeCompare(b.name));

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError('');
    const parsed = tagSchema.safeParse({ name });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setFieldError(issue?.message ?? 'Invalid tag name');
      return;
    }
    try {
      await createTag.mutateAsync(parsed.data.name);
      setName('');
      setFieldError('');
    } catch (err) {
      setFormError(getErrorMessage(err));
    }
  };

  return (
    <div>
      <PageHeader title="Tags" subtitle="Custom labels you can attach to any application" />

      <form onSubmit={(event) => void handleSubmit(event)} className="card mb-6 max-w-xl space-y-3 p-5">
        <label htmlFor="tagName" className="label">
          New tag
        </label>
        <div className="flex gap-2">
          <input
            id="tagName"
            className="input"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setFieldError('');
            }}
            placeholder="e.g. referral"
          />
          <button type="submit" className="btn btn-primary btn-md shrink-0" disabled={createTag.isPending}>
            {createTag.isPending ? <Spinner className="h-4 w-4" /> : <IconPlus className="h-4 w-4" />}
            Add tag
          </button>
        </div>
        {fieldError ? <InlineError message={fieldError} /> : null}
        <ErrorMessage message={formError} />
      </form>

      {isLoading ? (
        <p className="py-10 text-center text-sm text-slate-500">Loading tags…</p>
      ) : null}
      {!isLoading && isError ? <ErrorMessage message={getErrorMessage(error)} /> : null}

      {!isLoading && !isError && sorted.length === 0 ? (
        <EmptyState
          icon={<IconTag className="h-10 w-10" />}
          title="No tags yet"
          description="Tags like “referral” or “priority” make filtering your search easy. Create the first one above."
        />
      ) : null}

      {!isLoading && !isError && sorted.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {sorted.map((tag) => (
            <li
              key={tag.id}
              className={`inline-flex items-center rounded-md px-2.5 py-1 text-sm font-medium ${coloredTagClass(tag.name)}`}
            >
              #{tag.name}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}