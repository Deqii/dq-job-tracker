import { ApplicationStatus } from '../types';
import { STATUS_LABELS, STATUS_STYLES } from '../lib/utils';

export function StatusBadge({ status, className = '' }: { status: ApplicationStatus; className?: string }) {
  const style = STATUS_STYLES[status];
  return (
    <span className={`badge ring-1 ${style.badge} ${className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {STATUS_LABELS[status]}
    </span>
  );
}