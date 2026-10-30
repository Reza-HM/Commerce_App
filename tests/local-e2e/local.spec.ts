import { test, expect, confirmEmail } from '../e2e/account-fixture';

for (const hostname of ['localhost']) {
  test(`local account journey on ${hostname}`, async ({
    page,
    context,
    api: fixture,
  }) => {
    const api = `http://${hostname}:4184`;
    const requests: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/accounts/')) requests.push(request.url());
    });
    await page.goto(`http://${hostname}:4183/register`);
    await page
      .getByLabel('Email address', { exact: true })
      .fill('local-flow@example.test');
    await page
      .getByLabel('Password', { exact: true })
      .fill('A synthetic local passphrase');
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    await expect(
      page.getByText('Registration request processed.', { exact: true }),
    ).toBeVisible();
    await confirmEmail(page, fixture, 'A synthetic local passphrase');
    await page.goto(`http://${hostname}:4183/sign-in`);
    await page
      .getByLabel('Email address', { exact: true })
      .fill('local-flow@example.test');
    await page
      .getByLabel('Password', { exact: true })
      .fill('A synthetic local passphrase');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByText('You\u2019re signed in', { exact: true })).toBeVisible();
    expect(requests.some((url) => url === api + '/accounts/register')).toBe(true);
    expect(requests.some((url) => url === api + '/accounts/sessions')).toBe(true);
    const cookie = (await context.cookies()).find(
      (item) => item.name === '__Host-commerce_session',
    );
    expect(!!cookie).toBe(true);
    expect(cookie?.secure).toBe(true);
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe('Strict');
    const current = api + '/accounts/sessions/current';
    expect(
      await page.evaluate(
        async (url) =>
          (
            await fetch(url, {
              headers: { 'X-Commerce-Request': '1' },
              credentials: 'include',
            })
          ).status,
        current,
      ),
    ).toBe(200);
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(
      page.getByText('You\u2019re signed out.', { exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        async (url) =>
          (
            await fetch(url, {
              headers: { 'X-Commerce-Request': '1' },
              credentials: 'include',
            })
          ).status,
        current,
      ),
    ).toBe(401);
  });
}
