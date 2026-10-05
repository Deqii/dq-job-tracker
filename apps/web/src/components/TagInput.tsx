import { useMemo, useRef, useState } from 'react';

import { useTags } from '../hooks/useTags';
import { TagChip } from './TagChip';
import { IconPlus } from './Icons';

export function TagInput({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  const { data: existingTags = [] } = useTags();
  const [draft, setDraft] = useState('');
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const normalized = draft.trim().toLowerCase();
  const suggestions = useMemo(() => {
    if (!normalized) return [];
    return existingTags
      .map((tag) => tag.name)
      .filter((name) => name.toLowerCase().includes(normalized) && !value.includes(name))
      .slice(0, 6);
  }, [existingTags, normalized, value]);

  const addTag = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (!value.includes(trimmed) && value.length < 30) {
      onChange([...value, trimmed]);
    }
    setDraft('');
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      if (suggestions.length > 0) {
        addTag(suggestions[0] as string);
      } else {
        addTag(draft);
      }
    } else if (event.key === 'Backspace' && draft === '' && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div>
      {value.length > 0 ? (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {value.map((tag) => (
            <TagChip
              key={tag}
              name={tag}
              onRemove={() => onChange(value.filter((existing) => existing !== tag))}
            />
          ))}
        </div>
      ) : null}
      <div className="relative">
        <input
          ref={inputRef}
          className="input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 120)}
          placeholder="Type a tag and press Enter (e.g. referral, priority)"
          aria-label="Add tag"
        />
        {focused && suggestions.length > 0 ? (
          <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
            {suggestions.map((name) => (
              <li key={name}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    addTag(name);
                  }}
                >
                  <IconPlus className="h-3.5 w-3.5 text-slate-400" />
                  {name}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}