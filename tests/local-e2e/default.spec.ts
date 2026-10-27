import {test, expect} from '@playwright/test';

test('localhost browser selects the localhost API by default', async ({page}) => {
  let destination = '';
  await page.route(/^http:\/\/(localhost|127\.0\.0\.1):3001\//, route => { destination=route.request().url(); return route.abort(); });
  await page.goto('http://localhost:4183/register');
  await page.getByLabel('Email address',{exact:true}).fill('local-default@example.test');
  await page.getByLabel('Password',{exact:true}).fill('A synthetic local passphrase');
  await page.getByRole('button',{name:'Create account',exact:true}).click();
  await expect.poll(() => destination).toBe('http://localhost:3001/accounts/register');
});
