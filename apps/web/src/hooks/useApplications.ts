import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '../lib/api';
import type {
  Application,
  ApplicationFilters,
  ApplicationInput,
  ApplicationUpdateInput,
  StatusChangeInput,
} from '../types';

export function buildApplicationsQuery(filters: ApplicationFilters): string {
  const params = new URLSearchParams();
  if (filters.search) params.set('search', filters.search);
  if (filters.status) params.set('status', filters.status);
  if (filters.tag) params.set('tag', filters.tag);
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function useApplications(filters: ApplicationFilters = {}) {
  return useQuery({
    queryKey: ['applications', filters],
    queryFn: async () => {
      const { data } = await api.get<Application[]>(`/api/applications${buildApplicationsQuery(filters)}`);
      return data;
    },
  });
}

export function useApplication(id: string) {
  return useQuery({
    queryKey: ['application', id],
    queryFn: async () => {
      const { data } = await api.get<Application>(`/api/applications/${id}`);
      return data;
    },
    enabled: Boolean(id),
  });
}

export function useCreateApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ApplicationInput) => {
      const { data } = await api.post<Application>('/api/applications', input);
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['applications'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      void queryClient.invalidateQueries({ queryKey: ['companies'] });
      // Creating an application can introduce brand-new tags.
      void queryClient.invalidateQueries({ queryKey: ['tags'] });
    },
  });
}

export function useUpdateApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: ApplicationUpdateInput }) => {
      const { data } = await api.patch<Application>(`/api/applications/${id}`, input);
      return data;
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['application', variables.id] });
      void queryClient.invalidateQueries({ queryKey: ['applications'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      // Editing tags changes which tags exist and how they are used.
      void queryClient.invalidateQueries({ queryKey: ['tags'] });
    },
  });
}

export function useDeleteApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/api/applications/${id}`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['applications'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      void queryClient.invalidateQueries({ queryKey: ['companies'] });
    },
  });
}

export function useUpdateStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: StatusChangeInput }) => {
      const { data } = await api.post<Application>(`/api/applications/${id}/status`, input);
      return data;
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['application', variables.id] });
      void queryClient.invalidateQueries({ queryKey: ['applications'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export async function downloadExport(filters: ApplicationFilters = {}): Promise<void> {
  const url = `/api/applications/export${buildApplicationsQuery(filters)}`;
  const { data } = await api.get<Blob>(url, { responseType: 'blob' });

  const detectedType =
    typeof File !== 'undefined' && data instanceof Blob ? data.type : '';
  const size = typeof data !== 'string' ? data.size : 0;
  const generated = detectedType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || size === 0;

  const blob = new Blob([data], {
    type: generated
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : detectedType,
  });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = `applications-export-${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}