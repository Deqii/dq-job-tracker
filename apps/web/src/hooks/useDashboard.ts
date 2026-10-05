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

export function responseRateOf(counts: DashboardCounts, total: number): number | null {
  if (total === 0) return null;
  const responded =
    counts[ApplicationStatus.INTERVIEW] + counts[ApplicationStatus.OFFER];
  return (responded / total) * 100;
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