import {getMessages, getTranslations} from 'next-intl/server';
import {Account} from '../../../src/accounts/account';
import type {AccountMessages} from '../../../src/accounts/messages';

export async function generateMetadata() {const t=await getTranslations('Accounts');return {title:t('accountTitle'),description:t('accountDescription')};}
export default async function AccountPage() {
  const t=await getTranslations('Accounts');const messages=(await getMessages()).Accounts as AccountMessages;
  return <><h1 className="text-4xl font-medium tracking-tight sm:text-5xl">{t('accountTitle')}</h1><p className="mt-4 mb-8 leading-7 text-muted">{t('accountDescription')}</p><Account messages={messages}/></>;
}
