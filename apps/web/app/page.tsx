import {getTranslations} from 'next-intl/server';
import Link from 'next/link';

export default async function Home() {
  const t=await getTranslations('Foundation');
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-6xl flex-col items-start justify-center p-[clamp(1.5rem,6vw,6rem)]">
      <p className="mt-[.8rem] mb-16 text-[.8rem] font-bold tracking-[.24em]">{t('eyebrow')}</p>
      <span className="rounded-[2rem] border border-outline px-[.8rem] py-2 text-[.8rem]">{t('status')}</span>
      <h1 className="my-[1.8rem] max-w-[13ch] text-[clamp(2.4rem,6vw,5rem)] leading-[1.06] font-medium tracking-[-.05em] wrap-anywhere">{t('heading')}</h1>
      <p className="my-[1.1rem] max-w-[35rem] text-[1.1rem] leading-[1.7] text-muted">{t('description')}</p>
      <nav className="mt-6 flex flex-wrap gap-4" aria-label={t('eyebrow')}>
        <Link href="/register" className="rounded-xl bg-ink px-5 py-3 font-bold text-canvas outline-offset-4 focus-visible:outline-2">{t('register')}</Link>
        <Link href="/sign-in" className="rounded-xl border border-outline px-5 py-3 font-bold outline-offset-4 hover:bg-white focus-visible:outline-2">{t('signIn')}</Link>
      </nav>
    </main>
  );
}
