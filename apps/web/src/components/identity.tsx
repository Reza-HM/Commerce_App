import Link from 'next/link';
import type { ReactNode } from 'react';

export function Icon({
  name,
  className = 'size-5',
}: {
  name: 'arrow' | 'lock' | 'check' | 'eye' | 'eyeOff' | 'mail';
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {name === 'arrow' && <path d="M5 12h14m-6-6 6 6-6 6" />}
      {name === 'lock' && (
        <>
          <rect x="5" y="10" width="14" height="11" rx="3" />
          <path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" />
        </>
      )}
      {name === 'check' && <path d="m5 12 4 4L19 6" />}
      {name === 'mail' && (
        <>
          <rect x="3" y="5" width="18" height="14" rx="3" />
          <path d="m4 7 8 6 8-6" />
        </>
      )}
      {name === 'eye' && (
        <>
          <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z" />
          <circle cx="12" cy="12" r="3" />
        </>
      )}
      {name === 'eyeOff' && (
        <>
          <path d="m3 3 18 18M9 5.5A12 12 0 0 1 12 5c7 0 10 7 10 7a18 18 0 0 1-3 4M6 6C3 8 2 12 2 12s3 7 10 7a12 12 0 0 0 5-1m-7-8a3 3 0 0 0 4 4" />
        </>
      )}
    </svg>
  );
}
export function Brand({
  label,
  name,
  inverse = false,
}: {
  label: string;
  name: string;
  inverse?: boolean;
}) {
  return (
    <Link
      href="/"
      aria-label={label}
      className={`inline-flex w-fit items-center gap-3 rounded-lg outline-offset-8 focus-visible:outline-2 ${inverse ? 'text-white' : 'text-ink'}`}
    >
      <span
        className={`grid size-9 place-items-center rounded-xl ${inverse ? 'bg-white/10 text-white' : 'bg-action text-white'}`}
        aria-hidden="true"
      >
        <svg viewBox="0 0 24 24" fill="none" className="size-6">
          <path d="m6 7 6-3 6 3v10l-6 3-6-3V7Z" stroke="currentColor" strokeWidth="1.5" />
          <path d="m6 7 6 4 6-4m-6 4v9" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </span>
      <span className="text-[20px] sm:text-[22px] font-semibold tracking-[-.055em]">
        {name}
        <span className="text-accent" aria-hidden="true">
          .
        </span>
      </span>
    </Link>
  );
}
export function PrimaryLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="group inline-flex min-h-13 items-center justify-center gap-7 rounded-xl bg-action px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-accent/15 transition duration-180 motion-safe:active:translate-y-px hover:bg-action-hover hover:shadow-xl hover:shadow-accent/20 focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-4 motion-reduce:transition-none"
    >
      {children}
      <Icon
        name="arrow"
        className="size-4 transition-transform group-hover:translate-x-1 motion-reduce:transform-none"
      />
    </Link>
  );
}
