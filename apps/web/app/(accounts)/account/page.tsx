import {getMessages, getTranslations} from 'next-intl/server';
import {Account} from '../../../src/accounts/account';
import type {AccountMessages} from '../../../src/accounts/messages';

export async function generateMetadata() {const t=await getTranslations('Accounts');return {title:t('accountTitle'),description:t('accountDescription')};}
export default async function AccountPage() {
  const t=await getTranslations('Accounts');const messages=(await getMessages()).Accounts as AccountMessages;
  return <><h1 className="text-[2.5rem] leading-[1.12] font-semibold tracking-[-.055em] sm:text-[2.85rem]">{t('accountTitle')}</h1><p className="mt-3 mb-9 text-sm leading-7 text-muted">{t('accountDescription')}</p><Account messages={messages}/></>;
}
