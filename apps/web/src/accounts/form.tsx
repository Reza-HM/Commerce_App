'use client';

import Link from 'next/link';
import { Icon } from '../components/identity';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { accountApi } from './api';
import type { Result } from './api';
import type { AccountMessages } from './messages';

export function AccountForm({
  mode,
  messages: m,
}: {
  mode: 'register' | 'signIn';
  messages: AccountMessages;
}) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const password = useRef<HTMLInputElement>(null);
  const email = useRef<HTMLInputElement>(null);
  const feedback = useRef<HTMLDivElement>(null);
  const work = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const locked = useRef(false);
  const [pending, setPending] = useState(false);
  const [visible, setVisible] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<Extract<Result, { ok: false }> | null>(null);
  const [reason, setReason] = useState('');
  useEffect(() => {
    const reset = () => {
      generation.current++;
      work.current?.abort();
      locked.current = false;
      if (password.current) password.current.value = '';
      setVisible(false);
      setPending(false);
    };
    const restored = (event: PageTransitionEvent) => {
      if (event.persisted) reset();
    };
    const value = new URLSearchParams(window.location.search).get('reason');
    if (mode === 'signIn')
      setReason(
        value === 'signed-out'
          ? m.signedOut
          : value === 'session-required'
            ? m.sessionRequired
            : '',
      );
    window.addEventListener('pagehide', reset);
    window.addEventListener('pageshow', restored);
    return () => {
      generation.current++;
      work.current?.abort();
      if (password.current) password.current.value = '';
      window.removeEventListener('pagehide', reset);
      window.removeEventListener('pageshow', restored);
    };
  }, [mode, m]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current) return;
    const missing = !email.current?.value
      ? 'email'
      : !password.current?.value
        ? 'password'
        : undefined;
    if (missing) {
      setError({ ok: false, code: 'required', field: missing });
      (missing === 'email' ? email : password).current?.focus();
      return;
    }
    locked.current = true;
    setPending(true);
    setError(null);
    setReason('');
    const current = ++generation.current;
    const controller = new AbortController();
    work.current = controller;
    const result = await accountApi(
      mode,
      { email: email.current!.value, password: password.current!.value },
      controller.signal,
    );
    if (current !== generation.current) return;
    if (password.current) password.current.value = '';
    setVisible(false);
    locked.current = false;
    setPending(false);
    if (result.ok) {
      if (mode === 'register') {
        form.current?.reset();
        setAccepted(true);
      } else router.replace('/account');
    } else if (result.code !== 'cancelled') {
      setError(result);
      requestAnimationFrame(() => {
        if (current !== generation.current) return;
        if (result.field) (result.field === 'email' ? email : password).current?.focus();
        else feedback.current?.focus();
      });
    }
  }
  const inputClass =
    'mt-2 min-h-13 w-full rounded-xl border border-outline bg-canvas/60 px-4 py-3.5 text-base text-ink outline-none transition duration-180 motion-safe:active:translate-y-px placeholder:text-placeholder hover:border-muted focus:border-accent focus:bg-surface focus:ring-4 focus:ring-accent/10 aria-invalid:border-danger aria-invalid:bg-danger-soft aria-invalid:focus:ring-danger/15 disabled:cursor-wait disabled:opacity-60 motion-reduce:transition-none';
  const buttonClass =
    'group flex min-h-13 w-full items-center justify-center gap-3 rounded-xl bg-action px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-accent/15 transition duration-180 motion-safe:active:translate-y-px hover:bg-action-hover hover:shadow-xl hover:shadow-accent/20 focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-4 disabled:cursor-wait disabled:opacity-65 disabled:shadow-none motion-reduce:transition-none';
  return (
    <>
      <noscript>
        <p className="mb-6 rounded-xl border border-outline bg-canvas p-4 text-sm leading-6">
          {m.javascriptRequired}
        </p>
      </noscript>
      {reason && (
        <p
          role="status"
          className="mb-6 rounded-xl border border-outline bg-canvas p-4 text-sm leading-6"
        >
          {reason}
        </p>
      )}
      {accepted ? (
        <div
          role="status"
          className="motion-safe:animate-feedback space-y-4 rounded-2xl border border-outline bg-canvas p-6"
        >
          <span className="grid size-12 place-items-center rounded-full bg-accent-soft text-accent">
            <Icon name="check" />
          </span>
          <p className="text-xl font-medium">{m.accepted}</p>
          <p className="text-muted">{m.acceptedHelp}</p>
          <Link
            href="/verify-email/request"
            className="inline-flex min-h-11 items-center rounded font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-accent"
          >
            {m.verificationRequestLink}
          </Link>
          <Link
            href="/sign-in"
            className="inline-flex min-h-12 items-center gap-4 rounded-xl bg-action px-5 py-3 text-sm font-semibold text-white hover:bg-action-hover focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-4"
          >
            {m.signInLink}
          </Link>
        </div>
      ) : (
        <form
          ref={form}
          method="post"
          onSubmit={submit}
          noValidate
          className="space-y-5"
          aria-busy={pending}
        >
          <div>
            <label htmlFor="email" className="text-[13px] font-semibold">
              {m.email}
            </label>
            <input
              ref={email}
              id="email"
              name="email"
              type="text"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              placeholder={m.emailPlaceholder}
              required
              disabled={pending}
              aria-invalid={error?.field === 'email'}
              aria-describedby={error?.field === 'email' ? 'email-error' : undefined}
              className={inputClass}
            />
            {error?.field === 'email' && (
              <p
                id="email-error"
                role="alert"
                className="motion-safe:animate-feedback mt-2 text-sm font-medium text-danger"
              >
                {m.errors[error.code]}
              </p>
            )}
          </div>
          <div>
            <label htmlFor="password" className="text-[13px] font-semibold">
              {m.password}
            </label>
            <div className="relative">
              <input
                ref={password}
                id="password"
                name="password"
                type={visible ? 'text' : 'password'}
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                placeholder={
                  mode === 'register' ? m.passwordNewPlaceholder : m.passwordPlaceholder
                }
                required
                disabled={pending}
                aria-invalid={error?.field === 'password'}
                aria-describedby={
                  [
                    mode === 'register' ? 'password-help' : '',
                    error?.field === 'password' ? 'password-error' : '',
                  ]
                    .filter(Boolean)
                    .join(' ') || undefined
                }
                className={inputClass + ' pr-14'}
              />
              <button
                type="button"
                aria-label={visible ? m.hidePassword : m.showPassword}
                title={visible ? m.hidePassword : m.showPassword}
                aria-controls="password"
                aria-pressed={visible}
                onClick={() => setVisible((value) => !value)}
                className="absolute top-3 right-1 grid size-11 place-items-center rounded-lg text-muted transition-colors hover:bg-accent-soft hover:text-accent focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-1"
              >
                <Icon name={visible ? 'eyeOff' : 'eye'} />
              </button>
            </div>
            {mode === 'register' && (
              <p id="password-help" className="mt-3 text-xs leading-6 text-muted">
                {m.passwordHelp}
              </p>
            )}
            {error?.field === 'password' && (
              <p
                id="password-error"
                role="alert"
                className="motion-safe:animate-feedback mt-2 text-sm font-medium text-danger"
              >
                {m.errors[error.code]}
              </p>
            )}
          </div>
          <div
            ref={feedback}
            tabIndex={-1}
            className="rounded outline-offset-4 empty:hidden focus-visible:outline-2"
          >
            {error && !error.field && (
              <p
                role="alert"
                className="motion-safe:animate-feedback rounded-xl border border-danger-outline bg-danger-soft p-4 text-sm leading-6 text-danger"
              >
                {m.errors[error.code]}
              </p>
            )}
          </div>
          <button type="submit" disabled={pending} className={buttonClass}>
            {pending && (
              <span
                aria-hidden="true"
                className="size-4 rounded-full border-2 border-white/30 border-t-white motion-safe:animate-spin"
              />
            )}
            {mode === 'register' ? m.registerSubmit : m.signInSubmit}
            {!pending && (
              <Icon
                name="arrow"
                className="size-4 transition-transform group-hover:translate-x-1 motion-reduce:transform-none"
              />
            )}
          </button>
          {mode === 'signIn' && (
            <Link
              href="/forgot-password"
              className="inline-flex min-h-11 items-center rounded text-sm font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-4"
            >
              {m.forgotPasswordLink}
            </Link>
          )}
          <p role="status" className="min-h-5 text-center text-xs text-muted">
            {pending ? m.pending : ''}
          </p>
          <Link
            href="/verify-email/request"
            className="inline-flex min-h-11 items-center rounded text-sm font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-accent"
          >
            {m.verificationRequestLink}
          </Link>
          <p className="border-t border-outline/70 pt-6 text-center text-[13px] text-muted">
            {mode === 'register' ? m.alreadyAccount : m.newAccount}{' '}
            <Link
              href={mode === 'register' ? '/sign-in' : '/register'}
              className="rounded py-2 font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-4"
            >
              {mode === 'register' ? m.signInLink : m.registerLink}
            </Link>
          </p>
        </form>
      )}
    </>
  );
}
