import { ApplicationStatus } from '../types';

export const STATUS_ORDER: ApplicationStatus[] = [
  ApplicationStatus.WISHLIST,
  ApplicationStatus.APPLIED,
  ApplicationStatus.ASSESSMENT,
  ApplicationStatus.INTERVIEW,
  ApplicationStatus.OFFER,
  ApplicationStatus.REJECTED,
  ApplicationStatus.WITHDRAWN,
];

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  [ApplicationStatus.WISHLIST]: 'Wishlist',
  [ApplicationStatus.APPLIED]: 'Applied',
  [ApplicationStatus.ASSESSMENT]: 'Assessment',
  [ApplicationStatus.INTERVIEW]: 'Interview',
  [ApplicationStatus.OFFER]: 'Offer',
  [ApplicationStatus.REJECTED]: 'Rejected',
  [ApplicationStatus.WITHDRAWN]: 'Withdrawn',
};

export interface StatusStyle {
  text: string;
  dot: string;
  badge: string;
  bar: string;
}

export const STATUS_STYLES: Record<ApplicationStatus, StatusStyle> = {
  [ApplicationStatus.WISHLIST]: {
    text: 'text-slate-600',
    dot: 'bg-slate-400',
    badge: 'bg-slate-100 text-slate-700 ring-slate-200',
    bar: 'bg-slate-300',
  },
  [ApplicationStatus.APPLIED]: {
    text: 'text-blue-700',
    dot: 'bg-blue-500',
    badge: 'bg-blue-50 text-blue-700 ring-blue-200',
    bar: 'bg-blue-500',
  },
  [ApplicationStatus.ASSESSMENT]: {
    text: 'text-indigo-700',
    dot: 'bg-indigo-500',
    badge: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
    bar: 'bg-indigo-500',
  },
  [ApplicationStatus.INTERVIEW]: {
    text: 'text-purple-700',
    dot: 'bg-purple-500',
    badge: 'bg-purple-50 text-purple-700 ring-purple-200',
    bar: 'bg-purple-500',
  },
  [ApplicationStatus.OFFER]: {
    text: 'text-emerald-700',
    dot: 'bg-emerald-500',
    badge: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    bar: 'bg-emerald-500',
  },
  [ApplicationStatus.REJECTED]: {
    text: 'text-rose-700',
    dot: 'bg-rose-500',
    badge: 'bg-rose-50 text-rose-700 ring-rose-200',
    bar: 'bg-rose-500',
  },
  [ApplicationStatus.WITHDRAWN]: {
    text: 'text-slate-600',
    dot: 'bg-slate-400',
    badge: 'bg-slate-100 text-slate-600 ring-slate-300',
    bar: 'bg-slate-300',
  },
};

export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function timeAgo(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;

  const seconds = Math.floor((date.getTime() - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  const intervals: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 60 * 60 * 24 * 365],
    ['month', 60 * 60 * 24 * 30],
    ['week', 60 * 60 * 24 * 7],
    ['day', 60 * 60 * 24],
    ['hour', 60 * 60],
    ['minute', 60],
  ];

  for (const [unit, secondsPer] of intervals) {
    if (Math.abs(seconds) >= secondsPer) {
      return rtf.format(Math.round(seconds / secondsPer), unit);
    }
  }
  return rtf.format(seconds, 'second');
}

export function toISODateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseDateInput(value: string): Date | null {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatPercent(value: number): string {
  if (Number.isNaN(value)) return '—';
  return `${Math.round(value)}%`;
}

const TAG_ACCENTS = [
  'bg-slate-100 text-slate-700',
  'bg-blue-50 text-blue-700',
  'bg-indigo-50 text-indigo-700',
  'bg-emerald-50 text-emerald-700',
  'bg-amber-50 text-amber-700',
  'bg-purple-50 text-purple-700',
  'bg-rose-50 text-rose-700',
  'bg-cyan-50 text-cyan-700',
];

function hashCode(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function coloredTagClass(name: string): string {
  const idx = hashCode(name) % TAG_ACCENTS.length;
  return TAG_ACCENTS[idx] ?? (TAG_ACCENTS[0] as string);
}