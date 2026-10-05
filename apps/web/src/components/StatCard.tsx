import type { ReactNode } from 'react';

export function StatCard({
  label,
  value,
  icon,
  hint,
  accent = 'border-slate-200 bg-white',
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  hint?: ReactNode;
  accent?: string;
}) {
  return (
    <div className={`rounded-xl border p-4 shadow-sm ${accent}`}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        {icon ? <span className="text-slate-400">{icon}</span> : null}
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}