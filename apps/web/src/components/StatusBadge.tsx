import { ApplicationStatus } from '../types';
import { STATUS_LABELS, STATUS_STYLES } from '../lib/utils';

export interface StatusBadgeProps {
  status: ApplicationStatus;
  className?: string;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  ariaExpanded?: boolean;
  ariaHasPopup?: boolean | 'menu' | 'listbox' | 'tree' | 'grid' | 'dialog';
}

export function StatusBadge({
  status,
  className = '',
  onClick,
  disabled,
  ariaExpanded,
  ariaHasPopup,
  buttonRef,
}: StatusBadgeProps & { buttonRef?: React.Ref<HTMLButtonElement> }) {
  const style = STATUS_STYLES[status];
  const classes = `badge ring-1 ${style.badge} ${className}`;

  if (onClick) {
    return (
      <button
        type="button"
        ref={buttonRef}
        className={classes}
        onClick={onClick}
        disabled={disabled}
        aria-haspopup={ariaHasPopup}
        aria-expanded={ariaExpanded}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
        {STATUS_LABELS[status]}
      </button>
    );
  }

  return (
    <span className={classes}>
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {STATUS_LABELS[status]}
    </span>
  );
}
