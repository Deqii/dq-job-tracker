import { STATUS_LABELS, formatDateTime, timeAgo } from '../lib/utils';
import type { StatusHistoryEntry } from '../types';
import { StatusBadge } from './StatusBadge';

function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

export function StatusTimeline({ history }: { history: StatusHistoryEntry[] }) {
  if (history.length === 0) {
    return <p className="text-sm text-slate-500">No status change recorded yet.</p>;
  }

  const chronological = [...history].sort(
    (a, b) => new Date(a.changedAt).getTime() - new Date(b.changedAt).getTime(),
  );

  return (
    <ol className="relative space-y-6 border-l-2 border-slate-200 pl-6">
      {chronological.map((entry, index) => {
        const next = chronological[index + 1];
        const start = new Date(entry.changedAt).getTime();
        const end = next ? new Date(next.changedAt).getTime() : Date.now();
        const duration = start <= end ? formatDuration(end - start) : null;

        return (
          <li key={entry.id} className="relative">
            <span
              className="absolute -left-[31px] top-1 h-3 w-3 rounded-full border-2 border-white bg-brand-500 shadow"
              aria-hidden="true"
            />
            <div className="flex items-center gap-2">
              <StatusBadge status={entry.status} />
              <span className="text-xs text-slate-400" title={formatDateTime(entry.changedAt)}>
                {timeAgo(entry.changedAt)}
              </span>
            </div>
            {entry.note ? <p className="mt-1.5 whitespace-pre-wrap text-sm text-slate-600">{entry.note}</p> : null}
            {duration ? (
              <p className="mt-1 text-xs text-slate-400">
                {STATUS_LABELS[entry.status]} for {duration}
                {index === chronological.length - 1 ? ' so far' : ''}
              </p>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}