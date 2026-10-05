import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, MutableRefObject } from 'react';

import type { Company } from '../types';
import { IconBuilding, IconPlus } from './Icons';

type ComboboxOption =
  | { kind: 'company'; optionId: string; label: string; company: Company }
  | { kind: 'create'; optionId: string; label: string; name: string };

const MAX_VISIBLE = 8;

export interface CompanyComboboxProps {
  companies: Company[];
  value: string;
  onChange: (companyId: string) => void;
  onCreateCompany: (name: string) => Promise<Company>;
  errorMessage?: string;
  disabled?: boolean;
  inputRef?: MutableRefObject<HTMLInputElement | null>;
}

/**
 * Editable combobox over the user's existing companies. Typing filters
 * case-insensitively; when nothing matches, a "Create" option is offered so a
 * brand-new company can be registered without leaving the application form.
 */
export function CompanyCombobox({
  companies,
  value,
  onChange,
  onCreateCompany,
  errorMessage,
  disabled = false,
  inputRef,
}: CompanyComboboxProps) {
  const listboxId = 'company-combobox-listbox';
  const errorId = 'company-combobox-error';

  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [creating, setCreating] = useState(false);

  const lastValueRef = useRef(value);
  const companiesRef = useRef(companies);
  companiesRef.current = companies;

  // Re-sync the visible text whenever the selection is changed from the outside
  // (preselected company, or a form reset). Typing sets lastValueRef itself so
  // clearing the selection mid-edit does not wipe what the user is typing.
  useEffect(() => {
    if (lastValueRef.current === value) return;
    lastValueRef.current = value;
    const selected = companiesRef.current.find((company) => company.id === value);
    setText(selected?.name ?? '');
    if (!selected) setOpen(false);
  }, [value]);

  const select = (companyId: string, name: string) => {
    lastValueRef.current = companyId;
    onChange(companyId);
    setText(name);
    setOpen(false);
  };

  const options = useMemo<ComboboxOption[]>(() => {
    const query = text.trim().toLowerCase();
    const matches = companies
      .filter((company) => company.name.toLowerCase().includes(query))
      .sort((a, b) => a.name.localeCompare(b.name));

    const visible = matches.slice(0, MAX_VISIBLE).map<ComboboxOption>((company) => ({
      kind: 'company',
      optionId: `company-option-${company.id}`,
      label: company.name,
      company,
    }));

    const alreadyExists = matches.length > 0;
    if (text.trim() !== '' && !alreadyExists) {
      visible.push({
        kind: 'create',
        optionId: 'company-option-create',
        label: `Create "${text.trim()}"`,
        name: text.trim(),
      });
    }

    return visible;
  }, [companies, text]);

  useEffect(() => {
    setActiveIndex(0);
  }, [text, open]);

  const handleChange = (next: string) => {
    setText(next);
    setOpen(true);
    if (value !== '') {
      lastValueRef.current = '';
      onChange('');
    }
  };

  const chooseCreate = async (name: string) => {
    setCreating(true);
    try {
      const created = await onCreateCompany(name);
      select(created.id, created.name);
    } catch {
      setOpen(true);
    } finally {
      setCreating(false);
    }
  };

  const applyOption = (option: ComboboxOption | undefined) => {
    if (!option) return;
    if (option.kind === 'company') {
      select(option.company.id, option.company.name);
      return;
    }
    void chooseCreate(option.name);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (options.length === 0) return;
      event.preventDefault();
      setOpen(true);
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex((prev) => {
        const next = prev + delta;
        if (next < 0) return 0;
        if (next >= options.length) return options.length - 1;
        return next;
      });
      return;
    }

    if (event.key === 'Enter') {
      if (!open) return;
      const option = options[activeIndex];
      if (!option) return;
      event.preventDefault();
      applyOption(option);
      return;
    }

    if (event.key === 'Escape') {
      if (!open) return;
      event.preventDefault();
      setOpen(false);
    }
  };

  const activeOptionId = open && options.length > 0 ? options[activeIndex]?.optionId : undefined;

  return (
    <div>
      <div className="relative">
        <input
          ref={inputRef}
          id="companyId"
          name="companyId"
          className="input"
          role="combobox"
          aria-label="Company"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={activeOptionId}
          aria-invalid={errorMessage ? true : undefined}
          aria-describedby={errorMessage ? errorId : undefined}
          autoComplete="off"
          disabled={disabled}
          value={text}
          placeholder="Search companies, or type a new one…"
          onChange={(event) => handleChange(event.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        />
        {open && options.length > 0 ? (
          <ul
            id={listboxId}
            role="listbox"
            aria-label="Companies"
            className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
          >
            {options.map((option, index) => (
              <li key={option.optionId}>
                <div
                  id={option.optionId}
                  role="option"
                  aria-selected={index === activeIndex}
                  className={`flex cursor-pointer items-center gap-2 px-3 py-2 text-sm ${
                    index === activeIndex ? 'bg-brand-50 text-brand-700' : 'text-slate-700'
                  }`}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    applyOption(option);
                  }}
                  onMouseEnter={() => setActiveIndex(index)}
                >
                  {option.kind === 'create' ? (
                    <IconPlus className="h-3.5 w-3.5 text-brand-600" />
                  ) : (
                    <IconBuilding className="h-3.5 w-3.5 text-slate-400" />
                  )}
                  <span className="truncate">{option.label}</span>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {creating ? <p className="mt-1.5 text-xs text-slate-500">Creating company…</p> : null}
      {errorMessage ? (
        <p role="alert" id={errorId} className="mt-1.5 text-xs text-rose-600">
          {errorMessage}
        </p>
      ) : null}
      <p className="mt-2 text-xs text-slate-500">
        Start typing to filter. A name that does not exist yet can be created inline.
      </p>
    </div>
  );
}