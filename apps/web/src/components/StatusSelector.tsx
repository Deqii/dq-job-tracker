import { useState } from 'react';

import { useUpdateStatus } from '../hooks/useApplications';
import { getErrorMessage } from '../lib/api';
import { STATUS_LABELS, STATUS_ORDER } from '../lib/utils';
import { statusChangeSchema } from '../schemas';
import { ApplicationStatus } from '../types';
import { ErrorMessage } from './ErrorMessage';
import { NativeSelect } from './Select';
import { Spinner } from './Spinner';

export function StatusSelector({ applicationId }: { applicationId: string }) {
  const [status, setStatus] = useState<ApplicationStatus | ''>('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const updateStatus = useUpdateStatus();

  const submit = async () => {
    setError('');
    if (!status) {
      setError('Choose a status to move this application to.');
      return;
    }
    const parsed = statusChangeSchema.safeParse({ status, note });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setError(issue?.message ?? 'Invalid status update');
      return;
    }
    try {
      await updateStatus.mutateAsync({
        id: applicationId,
        input: {
          status: parsed.data.status,
          note: parsed.data.note?.trim() ? parsed.data.note : undefined,
        },
      });
      setNote('');
      setStatus('');
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <NativeSelect<ApplicationStatus>
          value={status}
          onChange={setStatus}
          placeholder="Move to status…"
          options={STATUS_ORDER.map((value) => ({ value, label: STATUS_LABELS[value] }))}
          selectProps={{ 'aria-label': 'New status' }}
        />
        <button
          type="button"
          className="btn btn-primary btn-md"
          onClick={() => void submit()}
          disabled={updateStatus.isPending || !status}
        >
          {updateStatus.isPending ? <Spinner className="h-4 w-4" /> : null}
          Update
        </button>
      </div>
      <label className="block">
        <span className="label">Note (optional)</span>
        <textarea
          className="input min-h-[70px] resize-y"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="e.g. Next round with hiring manager on Thursday"
        />
      </label>
      <ErrorMessage message={error} />
    </div>
  );
}