import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { StatusBadge } from '../components/StatusBadge';
import { StatusTimeline } from '../components/StatusTimeline';
import { ApplicationStatus } from '../types';

describe('StatusBadge', () => {
  it('renders the human label for a status', () => {
    render(<StatusBadge status={ApplicationStatus.INTERVIEW} />);
    expect(screen.getByText('Interview')).toBeInTheDocument();
  });
});

describe('StatusTimeline', () => {
  it('renders an empty state when there is no history', () => {
    render(<StatusTimeline history={[]} />);
    expect(screen.getByText(/No status change recorded yet/)).toBeInTheDocument();
  });

  it('shows entries with notes and durations', () => {
    const history = [
      {
        id: '1',
        status: ApplicationStatus.APPLIED,
        note: 'Sent via referral',
        changedAt: '2026-09-01T10:00:00.000Z',
      },
      {
        id: '2',
        status: ApplicationStatus.INTERVIEW,
        note: null,
        changedAt: '2026-09-10T10:00:00.000Z',
      },
    ];
    render(<StatusTimeline history={history} />);
    expect(screen.getByText('Interview')).toBeInTheDocument();
    expect(screen.getByText('Applied')).toBeInTheDocument();
    expect(screen.getByText('Sent via referral')).toBeInTheDocument();
  });
});