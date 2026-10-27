'use client';

import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {useEffect, useRef, useState} from 'react';
import type {FormEvent} from 'react';
import {accountApi} from './api';
import type {Result} from './api';
import type {AccountMessages} from './messages';

export function AccountForm({mode, messages: m}: {mode: 'register' | 'signIn'; messages: AccountMessages}) {
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
  const [error, setError] = useState<Extract<Result, {ok: false}> | null>(null);
  const [reason, setReason] = useState('');
  useEffect(() => {
    const reset = () => {
      generation.current++;work.current?.abort();locked.current=false;
      if (password.current) password.current.value='';
      setVisible(false);setPending(false);
    };
    const restored = (event: PageTransitionEvent) => {if (event.persisted) reset();};
    const value = new URLSearchParams(window.location.search).get('reason');
    if (mode === 'signIn') setReason(value === 'signed-out' ? m.signedOut : value === 'session-required' ? m.sessionRequired : '');
    window.addEventListener('pagehide',reset);
    window.addEventListener('pageshow',restored);
    return () => {
      generation.current++;work.current?.abort();
      if (password.current) password.current.value='';
      window.removeEventListener('pagehide',reset);window.removeEventListener('pageshow',restored);
    };
  },[mode,m]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current) return;
    const missing = !email.current?.value ? 'email' : !password.current?.value ? 'password' : undefined;
    if (missing) {
      setError({ok:false,code:'required',field:missing});
      (missing === 'email' ? email : password).current?.focus();return;
    }
    locked.current=true;setPending(true);setError(null);setReason('');
    const current=++generation.current;
    const controller=new AbortController();work.current=controller;
    const result=await accountApi(mode,{email:email.current!.value,password:password.current!.value},controller.signal);
    if (current !== generation.current) return;
    if (password.current) password.current.value='';
    setVisible(false);locked.current=false;setPending(false);
    if (result.ok) {
      if (mode === 'register') {form.current?.reset();setAccepted(true);}
      else router.replace('/account');
    } else if (result.code !== 'cancelled') {
      setError(result);
      requestAnimationFrame(() => {
        if (current !== generation.current) return;
        if (result.field) (result.field === 'email' ? email : password).current?.focus();
        else feedback.current?.focus();
      });
    }
  }
  const inputClass='mt-2 w-full rounded-xl border border-outline bg-white px-4 py-3 text-base text-ink outline-offset-4 focus-visible:outline-2 focus-visible:outline-ink disabled:opacity-60';
  const buttonClass='w-full rounded-xl bg-ink px-5 py-3 font-bold text-canvas outline-offset-4 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-ink disabled:cursor-wait disabled:opacity-60';
  return <>
    <noscript><p className="mb-6 rounded-xl border border-outline p-4 text-sm">{m.javascriptRequired}</p></noscript>
    {reason && <p role="status" className="mb-6 rounded-xl border border-outline p-4 text-sm">{reason}</p>}
    {accepted ? <div role="status" className="space-y-4">
      <p className="text-xl font-medium">{m.accepted}</p><p className="text-muted">{m.acceptedHelp}</p>
      <Link href="/sign-in" className="inline-block rounded-xl bg-ink px-5 py-3 font-bold text-canvas outline-offset-4 focus-visible:outline-2">{m.signInLink}</Link>
    </div> : <form ref={form} method="post" onSubmit={submit} noValidate className="space-y-6" aria-busy={pending}>
      <div>
        <label htmlFor="email" className="text-sm font-bold">{m.email}</label>
        <input ref={email} id="email" name="email" type="text" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} required disabled={pending}
          aria-invalid={error?.field === 'email'} aria-describedby={error?.field === 'email' ? 'email-error' : undefined} className={inputClass}/>
        {error?.field === 'email' && <p id="email-error" role="alert" className="mt-2 text-sm font-bold">{m.errors[error.code]}</p>}
      </div>
      <div>
        <label htmlFor="password" className="text-sm font-bold">{m.password}</label>
        <input ref={password} id="password" name="password" type={visible ? 'text' : 'password'} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} required disabled={pending}
          aria-invalid={error?.field === 'password'} aria-describedby={[mode === 'register' ? 'password-help' : '',error?.field === 'password' ? 'password-error' : ''].filter(Boolean).join(' ') || undefined} className={inputClass}/>
        <button type="button" aria-controls="password" aria-pressed={visible} onClick={() => setVisible(value => !value)} className="mt-2 rounded px-1 py-2 text-sm font-bold underline underline-offset-4 outline-offset-2 focus-visible:outline-2">{visible ? m.hidePassword : m.showPassword}</button>
        {mode === 'register' && <p id="password-help" className="mt-2 text-sm leading-6 text-muted">{m.passwordHelp}</p>}
        {error?.field === 'password' && <p id="password-error" role="alert" className="mt-2 text-sm font-bold">{m.errors[error.code]}</p>}
      </div>
      <div ref={feedback} tabIndex={-1} className="rounded outline-offset-4 focus-visible:outline-2">
        {error && !error.field && <p role="alert" className="text-sm font-bold leading-6">{m.errors[error.code]}</p>}
      </div>
      <button type="submit" disabled={pending} className={buttonClass}>{mode === 'register' ? m.registerSubmit : m.signInSubmit}</button>
      <p role="status" className="min-h-6 text-sm text-muted">{pending ? m.pending : ''}</p>
      <p className="text-sm text-muted">{mode === 'register' ? m.alreadyAccount : m.newAccount}{' '}
        <Link href={mode === 'register' ? '/sign-in' : '/register'} className="rounded font-bold text-ink underline underline-offset-4 outline-offset-4 focus-visible:outline-2">{mode === 'register' ? m.signInLink : m.registerLink}</Link>
      </p>
    </form>}
  </>;
}
