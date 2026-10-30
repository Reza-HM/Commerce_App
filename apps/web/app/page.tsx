import {getTranslations} from 'next-intl/server';
import Link from 'next/link';
import {Brand, Icon, PrimaryLink} from '../src/components/identity';
import {Sculpture} from '../src/components/sculpture';

export default async function Home() {
  const t=await getTranslations('Foundation');
  return <main id="main" className="mx-auto flex min-h-svh max-w-[1600px] flex-col px-6 sm:px-10 lg:px-16">
    <header className="flex items-center justify-between border-b border-outline/70 py-6 sm:py-8">
      <Brand name={t('brand')} label={t('home')}/>
      <nav aria-label={t('eyebrow')} className="flex items-center gap-5 sm:gap-8">
        <Link href="/sign-in" className="rounded-lg py-3 text-sm font-semibold transition-colors hover:text-accent focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-4">{t('signIn')}</Link>
        <Link href="/register" className="hidden items-center gap-4 rounded-xl border border-outline bg-white px-5 py-3 text-xs font-semibold transition-colors hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-4 sm:inline-flex">{t('register')}<Icon name="arrow" className="size-4"/></Link>
      </nav>
    </header>
    <section className="grid flex-1 items-center gap-10 py-14 lg:grid-cols-2 lg:gap-16 lg:py-20">
      <div className="motion-safe:animate-enter">
        <p className="mb-7 flex items-center gap-3 text-[10px] font-bold tracking-[.22em] text-muted"><span className="size-2 rounded-full bg-accent"/>{t('status')}</p>
        <h1 className="max-w-[10ch] text-[clamp(3.6rem,7.2vw,7rem)] leading-[.98] font-medium tracking-[-.065em]">{t('heading')}<br/><span className="font-display font-normal italic text-accent">{t('headingAccent')}</span></h1>
        <p className="mt-7 max-w-[350px] text-base leading-8 text-muted">{t('description')}</p>
        <div className="mt-9"><PrimaryLink href="/register">{t('register')}</PrimaryLink></div>
        <p className="mt-5 flex items-center gap-2 text-xs text-muted"><Icon name="lock" className="size-3.5"/>{t('note')}</p>
      </div>
      <div className="relative isolate rounded-[2rem] bg-night px-4 py-7 text-white sm:px-10 lg:py-12">
        <div className="flex items-center justify-between px-3 text-[10px] tracking-[.2em] text-slate-400"><span>{t('artLabel')}</span><span aria-hidden="true">{t('artEdition')}</span></div>
        <Sculpture/>
        <div className="mx-auto -mt-6 flex max-w-80 items-center gap-4 rounded-2xl border border-white/15 bg-white/5 p-5"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#a9baff]/15 text-[#b9c7ff]"><Icon name="check"/></span><div><p className="text-sm font-medium">{t('artTitle')}</p><p className="mt-1 text-xs leading-5 text-slate-400">{t('artDescription')}</p></div></div>
      </div>
    </section>
    <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-outline/70 py-6 text-[11px] text-muted"><span>{t('footer')}</span><span>{t('availability')}</span></footer>
  </main>;
}
