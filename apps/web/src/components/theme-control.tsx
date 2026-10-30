'use client';

import { useEffect, useRef, useState } from 'react';

type Preference = 'system' | 'light' | 'dark';
type Labels = { label: string; system: string; light: string; dark: string };
const parse = (value: string | null): Preference =>
  value === 'light' || value === 'dark' ? value : 'system';

export function ThemeControl({ labels }: { labels: Labels }) {
  const [preference, setPreference] = useState<Preference>('system');
  const current = useRef<Preference>('system');
  const apply = (value: Preference) => {
    current.current = value;
    setPreference(value);
    document.documentElement.dataset.theme =
      value === 'system'
        ? matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
        : value;
  };
  useEffect(() => {
    try {
      apply(parse(localStorage.getItem('commerce-theme')));
    } catch {
      apply('system');
    }
    const media = matchMedia('(prefers-color-scheme: dark)');
    const changed = () => {
      if (current.current === 'system') apply('system');
    };
    const stored = (event: StorageEvent) => {
      if (event.key === 'commerce-theme' || event.key === null)
        apply(parse(event.newValue));
    };
    media.addEventListener('change', changed);
    window.addEventListener('storage', stored);
    return () => {
      media.removeEventListener('change', changed);
      window.removeEventListener('storage', stored);
    };
  }, []);
  return (
    <label className="inline-flex shrink-0 items-center rounded-xl border border-outline bg-surface px-2 text-xs text-ink focus-within:outline-2 focus-within:outline-accent focus-within:outline-offset-4">
      <span className="sr-only">{labels.label}</span>
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        className="ml-1 size-4 text-muted"
      >
        <circle cx="12" cy="12" r="8" />
        <path d="M12 4a8 8 0 0 1 0 16Z" fill="currentColor" />
      </svg>
      <select
        aria-label={labels.label}
        value={preference}
        onChange={(event) => {
          const value = parse(event.target.value);
          apply(value);
          try {
            localStorage.setItem('commerce-theme', value);
          } catch {
            /* Preference remains usable in memory. */
          }
        }}
        className="min-h-11 max-w-24 cursor-pointer rounded-lg bg-surface py-2 pl-2 pr-1 text-xs text-ink outline-none"
      >
        <option value="system">{labels.system}</option>
        <option value="light">{labels.light}</option>
        <option value="dark">{labels.dark}</option>
      </select>
    </label>
  );
}
