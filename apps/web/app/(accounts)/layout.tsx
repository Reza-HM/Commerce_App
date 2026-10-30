import Link from 'next/link';
import {getTranslations} from 'next-intl/server';
import type {ReactNode} from 'react';
import {Brand, Icon} from '../../src/components/identity';
import {Sculpture} from '../../src/components/sculpture';

export default async function AccountLayout({children}: {children: ReactNode}) {
  const t=await getTranslations('Accounts');
  return <main id="main" className="min-h-svh lg:grid lg:grid-cols-[minmax(340px,.92fr)_1.08fr]">
    <aside className="relative hidden flex-col overflow-hidden bg-night p-10 text-white lg:flex xl:p-14">
      <Brand name={t('brand')} label={t('home')} inverse/>
      <div className="my-auto py-10">
        <p className="mb-5 flex items-center gap-3 text-[11px] font-semibold tracking-[.23em] text-[#a5b8fa]"><span className="h-px w-7 bg-[#a5b8fa]"/>{t('studioEyebrow')}</p>
        <h2 className="max-w-[11ch] text-[clamp(2.8rem,4.2vw,4.5rem)] leading-[1.06] tracking-[-.055em]">{t('studioHeading')}<br/><span className="font-display font-normal italic text-[#a9baff]">{t('studioAccent')}</span></h2>
        <Sculpture compact/>
        <p className="max-w-72 text-sm leading-7 text-slate-300">{t('studioDescription')}</p>
      </div>
      <div className="flex items-center justify-between border-t border-white/10 pt-6 text-[11px] text-slate-400"><span>{t('studioFooter')}</span><span aria-hidden="true">{t('studioEdition')}</span></div>
    </aside>
    <div className="flex min-h-svh flex-col bg-white px-6 py-7 sm:px-12 lg:px-12 xl:px-20">
      <nav aria-label={t('home')} className="flex min-h-10 items-center justify-between">
        <span className="lg:hidden"><Brand name={t('brand')} label={t('home')}/></span>
        <Link href="/" className="ml-auto inline-flex min-h-11 items-center gap-2 rounded-lg text-xs font-medium text-muted transition-colors hover:text-accent focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-4"><span aria-hidden="true">&#8592;</span>{t('backHome')}</Link>
      </nav>
      <section className="mx-auto my-auto w-full max-w-[420px] py-12 motion-safe:animate-enter sm:py-16">
        <p className="mb-5 flex items-center gap-2 text-[10px] font-bold tracking-[.2em] text-accent"><span className="size-1.5 rounded-full bg-accent"/>{t('eyebrow')}</p>
        {children}
      </section>
      <p className="flex items-center justify-center gap-2 pb-1 text-[11px] text-muted"><Icon name="lock" className="size-3.5"/>{t('sessionNote')}</p>
    </div>
  </main>;
}
