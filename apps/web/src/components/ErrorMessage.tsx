import { IconAlert } from './Icons';

export function ErrorMessage({ message, className = '' }: { message: string; className?: string }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className={`flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700 ${className}`}
    >
      <IconAlert className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

export function InlineError({ message }: { message: string }) {
  return (
    <p role="alert" className="mt-1.5 text-xs text-rose-600">
      {message}
    </p>
  );
}