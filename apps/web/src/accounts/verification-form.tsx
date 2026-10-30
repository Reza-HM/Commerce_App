'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { accountApi, type Result } from './api';
import type { AccountMessages } from './messages';
import { Icon } from '../components/identity';

const inputClass =
  'mt-2 min-h-13 w-full rounded-xl border border-outline bg-canvas/60 px-4 py-3.5 text-base text-ink outline-none transition duration-180 placeholder:text-placeholder hover:border-muted focus:border-accent focus:bg-surface focus:ring-4 focus:ring-accent/10 disabled:cursor-wait disabled:opacity-60 motion-reduce:transition-none';
const linkClass =
  'inline-flex min-h-11 items-center rounded font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-4';

export function VerificationForm({
  confirm,
  messages: m,
}: {
  confirm: boolean;
  messages: AccountMessages;
}) {
  const token = useRef('');
  const initialized = useRef(false);
  const epoch = useRef(0);
  const locked = useRef(false);
  const work = useRef<AbortController | null>(null);
  const password = useRef<HTMLInputElement>(null);
  const email = useRef<HTMLInputElement>(null);
  const feedback = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(false);
  const [visible, setVisible] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<Extract<Result, { ok: false }> | null>(null);

  useEffect(() => {
    ++epoch.current;
    const capture = () => {
      if (!confirm || (initialized.current && !window.location.hash)) return;
      initialized.current = true;
      epoch.current++;
      work.current?.abort();
      locked.current = false;
      token.current = '';
      if (password.current) password.current.value = '';
      setPending(false);
      setVisible(false);
      setDone(false);
      setError(null);
      try {
        const match = /^#token=([A-Za-z0-9_-]{43})$/.exec(window.location.hash);
        window.history.replaceState(window.history.state, '', '/verify-email');
        // Decode/re-encode without Buffer so the client bundle remains web-only.
        if (
          match &&
          btoa(atob(match[1]!.replace(/-/g, '+').replace(/_/g, '/') + '='))
            .replace(/=/g, '')
            .replace(/\+/g, '-')
            .replace(/\//g, '_') === match[1]
        )
          token.current = match[1]!;
      } catch {
        token.current = '';
      }
      setReady(!!token.current);
    };
    capture();
    setReady(!confirm || !!token.current);
    const clear = () => {
      epoch.current++;
      work.current?.abort();
      token.current = '';
      locked.current = false;
      if (password.current) password.current.value = '';
      setReady(!confirm);
      setPending(false);
      setVisible(false);
      setDone(false);
      setError(null);
    };
    const restored = (event: PageTransitionEvent) => {
      if (event.persisted) clear();
    };
    window.addEventListener('pagehide', clear);
    window.addEventListener('pageshow', restored);
    window.addEventListener('hashchange', capture);
    return () => {
      const leaving = ++epoch.current;
      work.current?.abort();
      if (password.current) password.current.value = '';
      // React's development effect replay remounts synchronously. Actual route
      // exit has no remount and discards the secret at the next microtask.
      queueMicrotask(() => {
        if (epoch.current === leaving) token.current = '';
      });
      window.removeEventListener('pagehide', clear);
      window.removeEventListener('pageshow', restored);
      window.removeEventListener('hashchange', capture);
    };
  }, [confirm]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current || !ready) return;
    const field = confirm ? password.current : email.current;
    if (!field?.value) {
      setError({ ok: false, code: 'required', field: confirm ? 'password' : 'email' });
      field?.focus();
      return;
    }
    locked.current = true;
    setPending(true);
    setError(null);
    const current = ++epoch.current;
    const controller = new AbortController();
    work.current = controller;
    const result = await accountApi(
      confirm ? 'confirmVerification' : 'requestVerification',
      confirm
        ? { token: token.current, password: password.current!.value }
        : { email: email.current!.value },
      controller.signal,
    );
    if (current !== epoch.current) return;
    if (password.current) password.current.value = '';
    setVisible(false);
    locked.current = false;
    setPending(false);
    if (result.ok) {
      token.current = '';
      setDone(true);
    } else if (result.code !== 'cancelled') setError(result);
    requestAnimationFrame(() => {
      if (current === epoch.current) feedback.current?.focus();
    });
  }

  return (
    <>
      <noscript>
        <p className="mb-6 text-sm text-muted">{m.javascriptRequired}</p>
      </noscript>
      <div
        id="verification-feedback"
        ref={feedback}
        tabIndex={-1}
        className="rounded outline-offset-4 focus-visible:outline-2 focus-visible:outline-accent"
      >
        {done && (
          <div
            role="status"
            className="space-y-3 rounded-2xl border border-outline bg-canvas p-6 motion-safe:animate-feedback"
          >
            <p className="text-xl font-medium">
              {confirm ? m.verificationSuccess : m.verificationAccepted}
            </p>
            <p className="text-sm leading-7 text-muted">
              {confirm ? m.verificationSuccessHelp : m.verificationAcceptedHelp}
            </p>
          </div>
        )}
        {!done && confirm && !ready && (
          <p
            role="status"
            className="rounded-xl border border-outline bg-canvas p-4 text-sm leading-7 text-muted"
          >
            {m.verificationMissing}
          </p>
        )}
        {error && (
          <p
            role="alert"
            className="mb-5 rounded-xl border border-danger-outline bg-danger-soft p-4 text-sm leading-7 text-danger motion-safe:animate-feedback"
          >
            {m.errors[error.code]}
          </p>
        )}
      </div>
      {!done && (
        <form method="post" noValidate onSubmit={submit} className="space-y-6">
          {confirm ? (
            ready && (
              <div>
                <label
                  htmlFor="verification-password"
                  className="text-[13px] font-semibold"
                >
                  {m.password}
                </label>
                <div className="relative">
                  <input
                    ref={password}
                    id="verification-password"
                    name="password"
                    type={visible ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    disabled={pending}
                    className={inputClass + ' pr-14'}
                    aria-invalid={error?.field === 'password'}
                    aria-describedby="verification-password-help verification-feedback"
                  />
                  <button
                    type="button"
                    aria-controls="verification-password"
                    aria-label={visible ? m.hidePassword : m.showPassword}
                    title={visible ? m.hidePassword : m.showPassword}
                    aria-pressed={visible}
                    onClick={() => setVisible((value) => !value)}
                    className="absolute top-3 right-1 grid size-11 place-items-center rounded-lg text-muted transition-colors hover:bg-accent-soft hover:text-accent focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-1"
                  >
                    <Icon name={visible ? 'eyeOff' : 'eye'} />
                  </button>
                </div>
                <p
                  id="verification-password-help"
                  className="mt-3 text-xs leading-6 text-muted"
                >
                  {m.verificationPasswordHelp}
                </p>
              </div>
            )
          ) : (
            <div>
              <label htmlFor="verification-email" className="text-[13px] font-semibold">
                {m.email}
              </label>
              <input
                ref={email}
                id="verification-email"
                name="email"
                type="email"
                autoComplete="email"
                aria-invalid={error?.field === 'email'}
                aria-describedby="verification-feedback"
                autoCapitalize="none"
                spellCheck={false}
                required
                disabled={pending}
                className={inputClass}
              />
            </div>
          )}
          {ready && (
            <button
              type="submit"
              disabled={pending}
              className="flex min-h-13 w-full items-center justify-center rounded-xl bg-action px-5 py-3.5 text-sm font-semibold text-white transition duration-180 hover:bg-action-hover focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-4 disabled:cursor-wait disabled:opacity-65 motion-reduce:transition-none"
            >
              {confirm ? m.verificationSubmit : m.verificationRequestSubmit}
            </button>
          )}
          <p role="status" className="min-h-5 text-center text-xs text-muted">
            {pending ? m.pending : ''}
          </p>
        </form>
      )}
      <nav
        aria-label={m.verificationNavigation}
        className="mt-6 flex flex-wrap justify-between gap-3 border-t border-outline pt-4 text-sm"
      >
        <Link href="/verify-email/request" className={linkClass}>
          {m.verificationRequestLink}
        </Link>
        <Link href="/sign-in" className={linkClass}>
          {m.signInLink}
        </Link>
      </nav>
    </>
  );
}
