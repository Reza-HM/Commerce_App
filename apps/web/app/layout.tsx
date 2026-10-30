import type {Metadata} from 'next';
import type {ReactNode} from 'react';
import {getTranslations} from 'next-intl/server';
import './globals.css';

export async function generateMetadata(): Promise<Metadata> {
  const t=await getTranslations('Foundation');
  return {title:t('title'),description:t('description')};
}
export default async function RootLayout({children}: Readonly<{children:ReactNode}>) {
  const t=await getTranslations('Foundation');
  return <html lang="en" className="bg-canvas font-sans leading-[normal] text-ink scheme-light"><body><a href="#main" className="sr-only rounded-xl bg-accent px-5 py-3 font-semibold text-white focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:outline-2 focus:outline-offset-4 focus:outline-accent">{t('skip')}</a>{children}</body></html>;
}
