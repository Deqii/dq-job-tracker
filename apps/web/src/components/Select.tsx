import type { HTMLProps, ReactNode } from 'react';

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

interface SelectFieldProps<T extends string> {
  value: T | '';
  onChange: (value: T | '') => void;
  options: ReadonlyArray<SelectOption<T>>;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  selectProps?: Omit<HTMLProps<HTMLSelectElement>, 'value' | 'onChange'>;
}

export function NativeSelect<T extends string>({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  className = '',
  selectProps,
}: SelectFieldProps<T>) {
  return (
    <select
      {...selectProps}
      className={`input pr-8 ${className}`}
      value={value}
      disabled={disabled ?? false}
      onChange={(event) => {
        const next = event.target.value;
        onChange((next === '' ? '' : (next as T)) as T | '');
      }}
    >
      <option value="">{placeholder ?? 'Any'}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-4">
      <legend className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</legend>
      {children}
    </fieldset>
  );
}