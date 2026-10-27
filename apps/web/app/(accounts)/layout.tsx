import Link from 'next/link';
import {getTranslations} from 'next-intl/server';
import type {ReactNode} from 'react';

export default async function AccountLayout({children}: {children: ReactNode}) {
  const t=await getTranslations('Accounts');
  return <main className="mx-auto flex min-h-svh w-full max-w-6xl flex-col px-6 py-8 sm:px-12 sm:py-12">
    <nav aria-label={t('home')}><Link href="/" className="rounded text-sm font-bold tracking-[.2em] underline-offset-4 outline-offset-4 hover:underline focus-visible:outline-2">{t('home')}</Link></nav>
    <section className="mx-auto my-auto w-full max-w-lg py-12 sm:py-16">
      <p className="mb-4 text-xs font-bold tracking-[.2em] text-muted">{t('eyebrow')}</p>
      {children}
    </section>
  </main>;
}
