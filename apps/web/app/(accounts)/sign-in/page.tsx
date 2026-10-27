import {getMessages, getTranslations} from 'next-intl/server';
import {AccountForm} from '../../../src/accounts/form';
import type {AccountMessages} from '../../../src/accounts/messages';

export async function generateMetadata() {const t=await getTranslations('Accounts');return {title:t('signInTitle'),description:t('signInDescription')};}
export default async function SignInPage() {
  const t=await getTranslations('Accounts');const messages=(await getMessages()).Accounts as AccountMessages;
  return <><h1 className="text-4xl font-medium tracking-tight sm:text-5xl">{t('signInTitle')}</h1><p className="mt-4 mb-8 leading-7 text-muted">{t('signInDescription')}</p><AccountForm mode="signIn" messages={messages}/></>;
}
