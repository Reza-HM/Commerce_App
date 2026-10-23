import type {Metadata} from 'next';
import type {ReactNode} from 'react';
import {getTranslations} from 'next-intl/server';
import './globals.css';

export async function generateMetadata(): Promise<Metadata> {
  const t=await getTranslations('Foundation');
  return {title:t('title'),description:t('description')};
}
export default function RootLayout({children}: Readonly<{children:ReactNode}>) {
  return <html lang="en"><body>{children}</body></html>;
}
