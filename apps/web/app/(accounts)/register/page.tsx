import {getMessages, getTranslations} from 'next-intl/server';
import {AccountForm} from '../../../src/accounts/form';
import type {AccountMessages} from '../../../src/accounts/messages';

export async function generateMetadata() {const t=await getTranslations('Accounts');return {title:t('registerTitle'),description:t('registerDescription')};}
export default async function RegisterPage() {
  const t=await getTranslations('Accounts');const messages=(await getMessages()).Accounts as AccountMessages;
  return <><h1 className="text-4xl font-medium tracking-tight sm:text-5xl">{t('registerTitle')}</h1><p className="mt-4 mb-8 leading-7 text-muted">{t('registerDescription')}</p><AccountForm mode="register" messages={messages}/></>;
}
