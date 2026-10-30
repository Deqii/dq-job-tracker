import { useQuery } from '@tanstack/react-query';

import { api } from '../lib/api';
import { ApplicationStatus } from '../types';
import type { DashboardCounts, DashboardStats } from '../types';

export function emptyCounts(): DashboardCounts {
  return {
    [ApplicationStatus.WISHLIST]: 0,
    [ApplicationStatus.APPLIED]: 0,
    [ApplicationStatus.ASSESSMENT]: 0,
    [ApplicationStatus.INTERVIEW]: 0,
    [ApplicationStatus.OFFER]: 0,
    [ApplicationStatus.REJECTED]: 0,
    [ApplicationStatus.WITHDRAWN]: 0,
  };
}

export interface DashboardViewModel extends DashboardStats {
  responseRate: number | null;
}

export function replyCountOf(counts: DashboardCounts): number {
  return (
    counts[ApplicationStatus.ASSESSMENT] +
    counts[ApplicationStatus.INTERVIEW] +
    counts[ApplicationStatus.OFFER] +
    counts[ApplicationStatus.REJECTED]
  );
}

export function interviewCountOf(counts: DashboardCounts): number {
  return counts[ApplicationStatus.INTERVIEW] + counts[ApplicationStatus.OFFER];
}

export function responseRateOf(counts: DashboardCounts, total: number): number | null {
  if (total === 0) return null;
  return (replyCountOf(counts) / total) * 100;
}

export function interviewRateOf(counts: DashboardCounts, total: number): number | null {
  if (total === 0) return null;
  return (interviewCountOf(counts) / total) * 100;
}

export function tapeCountsOf(
  counts: DashboardCounts,
  cap = 120,
): Record<ApplicationStatus, number> {
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  if (total <= cap) return { ...counts };

  const scaled = {} as Record<ApplicationStatus, number>;
  for (const status of Object.keys(counts) as ApplicationStatus[]) {
    const count = counts[status];
    scaled[status] = count > 0 ? Math.max(1, Math.round((count * cap) / total)) : 0;
  }
  return scaled;
}

export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const { data } = await api.get<DashboardStats>('/api/dashboard');
      return data;
    },
  });
}