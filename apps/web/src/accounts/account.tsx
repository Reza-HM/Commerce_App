'use client';

import {useRouter} from 'next/navigation';
import {useEffect, useRef, useState, useSyncExternalStore} from 'react';
import {Icon} from '../components/identity';
import {accountApi} from './api';
import {AccountSession} from './session';
import type {AccountMessages} from './messages';

export function Account({messages: m}: {messages: AccountMessages}) {
  const router=useRouter();
  const [session]=useState(() => new AccountSession(accountApi,path => router.replace(path)));
  const state=useSyncExternalStore(session.subscribe,session.snapshot,session.snapshot);
  const feedback=useRef<HTMLDivElement>(null);
  useEffect(() => {
    void session.inspect();
    const visible=() => {if (document.visibilityState === 'visible') void session.inspect();};
    const restored=(event: PageTransitionEvent) => {if (event.persisted) void session.inspect();};
    const hidden=() => {session.stop();};
    document.addEventListener('visibilitychange',visible);
    window.addEventListener('pageshow',restored);window.addEventListener('pagehide',hidden);
    return () => {session.stop();document.removeEventListener('visibilitychange',visible);window.removeEventListener('pageshow',restored);window.removeEventListener('pagehide',hidden);};
  },[session]);
  useEffect(() => {if (state === 'unavailable' || state === 'unconfirmed') feedback.current?.focus();},[state]);
  const button='mt-6 inline-flex min-h-12 items-center justify-center rounded-xl border border-outline bg-white px-5 py-3 text-sm font-semibold text-ink transition-colors hover:border-accent hover:bg-accent-soft hover:text-accent focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-4';
  return <div className="rounded-2xl border border-outline bg-canvas/70 p-6 sm:p-8">
    {state === 'checking' && <p role="status" className="text-muted">{m.checking}</p>}
    {state === 'signingOut' && <p role="status" className="text-muted">{m.signingOut}</p>}
    {state === 'signedIn' && <><div className="mb-6 flex items-center justify-between"><span className="grid size-12 place-items-center rounded-xl bg-accent-soft text-accent"><Icon name="check"/></span><span className="text-[10px] font-semibold tracking-[.16em] text-muted">{m.accountDetail}</span></div><p role="status" className="text-2xl font-medium">{m.signedIn}</p><p className="mt-3 text-sm leading-7 text-muted">{m.signedInHelp}</p><div className="mt-6 flex items-start gap-3 border-t border-outline pt-5"><Icon name="lock" className="mt-1 size-4 shrink-0 text-accent"/><div><p className="text-sm font-semibold">{m.accountSession}</p><p className="mt-1 text-xs leading-6 text-muted">{m.accountPrivacy}</p></div></div><button type="button" className={button} onClick={() => void session.signOut()}>{m.signOut}</button></>}
    {(state === 'unavailable' || state === 'unconfirmed') && <div ref={feedback} tabIndex={-1} className="rounded outline-offset-4 focus-visible:outline-2">
      <p role="alert" className="leading-7">{state === 'unconfirmed' ? m.signOutUnconfirmed : m.checkUnavailable}</p>
      <button type="button" className={button} onClick={() => {if (state === 'unconfirmed') void session.signOut();else void session.inspect();}}>{state === 'unconfirmed' ? m.retrySignOut : m.retry}</button>
    </div>}
  </div>;
}
