import { useMemo, useState, type CSSProperties } from 'react';

import { useTags } from '../hooks/useTags';

function normalizeTag(value: string): string {
  return value
    .trim()
    .replace(/^#+/, '')
    .toLowerCase()
    .replace(/\s+/g, '-');
}

export function TagInput({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  const { data: existingTags = [] } = useTags();
  const [draft, setDraft] = useState('');

  const names = useMemo(() => {
    const fromServer = existingTags.map((tag) => tag.name);
    const extras = value.filter((name) => !fromServer.includes(name));
    return [...fromServer, ...extras];
  }, [existingTags, value]);

  const addTag = (name: string) => {
    const normalized = normalizeTag(name);
    if (!normalized) return;
    if (!value.includes(normalized) && value.length < 30) {
      onChange([...value, normalized]);
    }
    setDraft('');
  };

  const toggle = (name: string) => {
    if (value.includes(name)) {
      onChange(value.filter((existing) => existing !== name));
      return;
    }
    if (value.length < 30) onChange([...value, name]);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      addTag(draft);
    } else if (event.key === 'Backspace' && draft === '' && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {names.length > 0 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {names.map((name) => {
            const on = value.includes(name);
            return (
              <button
                key={name}
                type="button"
                className="stg chip-in"
                aria-pressed={on}
                aria-label={on ? `Remove tag ${name}` : undefined}
                onClick={() => toggle(name)}
                style={
                  {
                    height: '36px',
                    padding: '0 12px 0 14px',
                    borderRadius: '18px',
                    border: on ? '2px solid var(--ink)' : '2px dashed var(--ink3)',
                    background: on ? 'var(--ink)' : 'var(--card)',
                    color: on ? 'var(--card)' : 'var(--ink2)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontWeight: 700,
                    fontSize: '14px',
                  } as CSSProperties
                }
              >
                <span>#{name}</span>
                {on ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 6L6 18"></path><path d="M6 6l12 12"></path></svg>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
      <label
        className="field tagfield"
        style={{
          height: '42px',
          display: 'flex',
          alignItems: 'center',
          padding: '0 16px',
          border: '2px dashed var(--ink3)',
          borderRadius: '21px',
        }}
      >
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a tag and press Enter"
          aria-label="Add tag"
          style={{ width: '100%', height: '100%', background: 'transparent', border: 0, fontSize: '14px', color: 'var(--ink)' }}
        />
      </label>
    </div>
  );
}
