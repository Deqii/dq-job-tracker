import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent, MutableRefObject } from 'react';

import type { Company } from '../types';

type ComboboxOption =
  | { kind: 'company'; optionId: string; label: string; company: Company }
  | { kind: 'create'; optionId: string; label: string; name: string };

const MAX_VISIBLE = 6;

export interface CompanyComboboxProps {
  companies: Company[];
  value: string;
  onChange: (companyId: string) => void;
  onCreateCompany: (name: string) => Promise<Company>;
  errorMessage?: string;
  disabled?: boolean;
  inputRef?: MutableRefObject<HTMLInputElement | null>;
  onTextChange?: (text: string) => void;
}

/**
 * Editable combobox over the user's existing companies. Typing filters
 * case-insensitively; when the exact name does not exist yet, a "Create" row
 * sits alongside the matches so a new company can be registered inline.
 */
export function CompanyCombobox({
  companies,
  value,
  onChange,
  onCreateCompany,
  errorMessage,
  disabled = false,
  inputRef,
  onTextChange,
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
  const onTextChangeRef = useRef(onTextChange);
  onTextChangeRef.current = onTextChange;

  // Re-sync the visible text whenever the selection is changed from the outside
  // (preselected company, or a form reset). Typing sets lastValueRef itself so
  // clearing the selection mid-edit does not wipe what the user is typing.
  useEffect(() => {
    if (lastValueRef.current === value) return;
    lastValueRef.current = value;
    const selected = companiesRef.current.find((company) => company.id === value);
    const next = selected?.name ?? '';
    setText(next);
    onTextChangeRef.current?.(next);
    if (!selected) setOpen(false);
  }, [value]);

  const select = (companyId: string, name: string) => {
    lastValueRef.current = companyId;
    onChange(companyId);
    setText(name);
    onTextChangeRef.current?.(name);
    setOpen(false);
  };

  const query = text.trim().toLowerCase();
  const exact = companies.find((company) => company.name.toLowerCase() === query);

  const options = useMemo<ComboboxOption[]>(() => {
    const matches = companies
      .filter((company) => company.name.toLowerCase().includes(query))
      .sort((a, b) => a.name.localeCompare(b.name));

    const visible = matches.slice(0, MAX_VISIBLE).map<ComboboxOption>((company) => ({
      kind: 'company',
      optionId: `company-option-${company.id}`,
      label: company.name,
      company,
    }));

    if (query !== '' && !exact) {
      visible.push({
        kind: 'create',
        optionId: 'company-option-create',
        label: `Create "${text.trim()}"`,
        name: text.trim(),
      });
    }

    return visible;
  }, [companies, query, exact, text]);

  useEffect(() => {
    setActiveIndex(0);
  }, [text, open]);

  const handleChange = (next: string) => {
    setText(next);
    onTextChangeRef.current?.(next);
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
  const isExisting = value !== '' && companies.some((company) => company.id === value);
  const isNew = query.length > 0 && !exact && !open;
  const listTitle = query ? 'Matching companies' : 'Your companies';

  return (
    <div style={{ position: 'relative' }}>
      <label
        className="field"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          height: '52px',
          padding: '0 16px',
          background: 'var(--card)',
          border: '2px solid var(--ink)',
          borderRadius: '16px',
          color: 'var(--ink3)',
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="M21 21l-4.3-4.3"></path></svg>
        <input
          ref={inputRef}
          id="companyId"
          name="companyId"
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
          style={{ flex: '1 1 auto', minWidth: 0, height: '100%', background: 'transparent', border: 0, fontSize: '15px', color: 'var(--ink)' }}
        />
        {isExisting ? (
          <span
            className="pop-now"
            style={{
              '--r': '-2deg',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '2px 10px 2px 8px',
              border: '1.5px solid var(--ink)',
              borderRadius: '999px',
              background: 'var(--good)',
              color: 'var(--ink)',
              fontSize: '12.5px',
              fontWeight: 800,
              whiteSpace: 'nowrap',
            } as CSSProperties}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"></path></svg>
            <span>Saved company</span>
          </span>
        ) : null}
        {isNew ? (
          <span
            className="pop-now"
            style={{
              '--r': '2deg',
              padding: '2px 10px',
              border: '1.5px solid var(--ink)',
              borderRadius: '999px',
              background: 'var(--marker)',
              color: 'var(--ink)',
              fontSize: '12.5px',
              fontWeight: 800,
              whiteSpace: 'nowrap',
            } as CSSProperties}
          >
            New company
          </span>
        ) : null}
      </label>

      {open && options.length > 0 ? (
        <div
          id={listboxId}
          className="menu-in"
          role="listbox"
          aria-label="Companies"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 'calc(100% + 10px)',
            zIndex: 20,
            background: 'var(--card)',
            border: '2px solid var(--ink)',
            borderRadius: '18px',
            boxShadow: '6px 6px 0 var(--ink)',
            padding: '8px',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
            maxHeight: '360px',
            overflow: 'auto',
          }}
        >
          <div style={{ padding: '6px 12px 4px', fontSize: '12.5px', fontWeight: 700, color: 'var(--ink3)' }}>{listTitle}</div>
          {options.map((option, index) => (
            <button
              key={option.optionId}
              id={option.optionId}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              className="opt"
              onMouseDown={(event) => {
                event.preventDefault();
                applyOption(option);
              }}
              onMouseEnter={() => setActiveIndex(index)}
              style={
                option.kind === 'create'
                  ? {
                      height: '48px',
                      padding: '0 12px',
                      borderRadius: '12px',
                      borderTop: '2px dashed var(--line)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      fontWeight: 700,
                    }
                  : {
                      height: '44px',
                      padding: '0 12px',
                      borderRadius: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      fontWeight: 600,
                    }
              }
            >
              {option.kind === 'create' ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5v14"></path><path d="M5 12h14"></path></svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 21h18"></path><path d="M5 21V7l8-4v18"></path><path d="M19 21V11l-6-4"></path></svg>
              )}
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      ) : null}

      {creating ? <p style={{ margin: '8px 0 0', fontSize: '12.5px', color: 'var(--ink3)' }}>Creating company…</p> : null}
      {errorMessage ? (
        <p role="alert" id={errorId} style={{ margin: '6px 0 0', fontSize: '12.5px', color: 'var(--crit)' }}>
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
