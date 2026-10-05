import { useState } from 'react';

import { getErrorMessage } from '../lib/api';
import { Modal } from './Modal';
import { Spinner } from './Spinner';

export function ConfirmDialog({
  open,
  onClose,
  title,
  message,
  confirmLabel = 'Delete',
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => Promise<void> | void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleConfirm = async () => {
    setError('');
    setSubmitting(true);
    try {
      await onConfirm();
      setSubmitting(false);
      onClose();
    } catch (err) {
      setSubmitting(false);
      setError(getErrorMessage(err));
    }
  };

  return (
    <Modal open={open} onClose={submitting ? () => undefined : onClose} title={title}>
      <p className="text-sm text-slate-600">{message}</p>
      {error ? (
        <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      ) : null}
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className="btn btn-secondary btn-md" onClick={onClose} disabled={submitting}>
          Cancel
        </button>
        <button type="button" className="btn btn-danger btn-md" onClick={handleConfirm} disabled={submitting}>
          {submitting ? <Spinner className="h-4 w-4" /> : null}
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}