import { test, expect } from './account-fixture';

const password = 'Synthetic verification browser phrase';
async function register(page: import('@playwright/test').Page) {
  await page.goto('/register');
  await page
    .getByLabel('Email address', { exact: true })
    .fill('verification@example.test');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(
    page.getByText('Registration request processed.', { exact: true }),
  ).toBeVisible();
}

for (const colorScheme of ['light', 'dark'] as const)
  for (const width of [1280, 375]) {
    test(`email confirmation is explicit, accessible and transient in ${colorScheme} at ${width}px`, async ({
      page,
      api,
      context,
    }) => {
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      await page.setViewportSize({ width, height: 900 });
      await register(page);
      const link = await api.verificationLink();
      const token = new URL(link).hash.slice('#token='.length);
      let confirmations = 0;
      page.on('request', (request) => {
        if (
          request.method() === 'POST' &&
          request.url().endsWith('/email-verification/confirm')
        )
          confirmations++;
      });
      const response = await page.goto(link);
      await expect(page).toHaveURL(/\/verify-email$/);
      expect(response?.headers()['referrer-policy']).toBe('no-referrer');
      expect(confirmations).toBe(0);
      expect((await page.content()).includes(token)).toBe(false);
      expect(
        (await context.cookies()).some(
          (cookie) => cookie.name === '__Host-commerce_session',
        ),
      ).toBe(false);
      await page.getByLabel('Password', { exact: true }).fill('wrong');
      await page
        .getByRole('button', { name: 'Confirm email address', exact: true })
        .click();
      await expect(page.getByRole('main').getByRole('alert')).toContainText(
        'couldn’t confirm',
      );
      await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
      await page.getByLabel('Password', { exact: true }).fill(password);
      await page.getByRole('button', { name: 'Show password', exact: true }).focus();
      await page.keyboard.press('Enter');
      await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute(
        'type',
        'text',
      );
      await page.keyboard.press('Tab');
      await page.keyboard.press('Enter');
      await expect(
        page.getByText('Your email is confirmed', { exact: true }),
      ).toBeVisible();
      expect(confirmations).toBe(2);
      expect(
        (await context.cookies()).some(
          (cookie) => cookie.name === '__Host-commerce_session',
        ),
      ).toBe(false);
      const storage = await page.evaluate(() =>
        JSON.stringify([{ ...localStorage }, { ...sessionStorage }]),
      );
      expect(storage.includes(token)).toBe(false);
      expect(storage.includes(password)).toBe(false);
      expect(api.logs.join(' ').includes(token)).toBe(false);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      ).toBe(true);
      await page.screenshot({
        path: `.local/design-review/verification-${colorScheme}-${width}.png`,
        fullPage: true,
      });
      await page.getByRole('link', { name: 'Sign in', exact: true }).click();
      await page
        .getByLabel('Email address', { exact: true })
        .fill('verification@example.test');
      await page.getByLabel('Password', { exact: true }).fill(password);
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      await expect(page.getByText('You’re signed in', { exact: true })).toBeVisible();
    });
  }

test('reload and history restoration discard the verification secret; request feedback stays generic', async ({
  page,
  api,
}) => {
  await register(page);
  const link = await api.verificationLink();
  await page.goto(link);
  await expect(page).toHaveURL(/\/verify-email$/);
  await page.reload();
  await expect(page.getByText(/Open a valid confirmation link/)).toBeVisible();
  await page.goto(link);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.evaluate(() =>
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })),
  );
  await expect(page.getByText(/Open a valid confirmation link/)).toBeVisible();
  await page.goto('/verify-email/request');
  await page.getByLabel('Email address', { exact: true }).fill('unknown@example.test');
  await page
    .getByRole('button', { name: 'Request verification email', exact: true })
    .click();
  await expect(
    page.getByText('Verification request processed.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/If your account needs verification/)).toBeVisible();
});

test('blocked URL cleanup sends no confirmation', async ({ page, api }) => {
  await register(page);
  const link = await api.verificationLink();
  await page.addInitScript(() => {
    const original = window.history.replaceState.bind(window.history);
    window.history.replaceState = (state, unused, url) => {
      if (url === '/verify-email') throw new Error('blocked');
      return original(state, unused, url);
    };
  });
  await page.goto(link);
  await expect(page.getByText(/Open a valid confirmation link/)).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Confirm email address', exact: true }),
  ).toHaveCount(0);
});

test('malformed and used links fail safely without implicit confirmation', async ({
  page,
  api,
}) => {
  await register(page);
  const link = await api.verificationLink();
  let confirmations = 0;
  page.on('request', (request) => {
    if (
      request.method() === 'POST' &&
      request.url().endsWith('/email-verification/confirm')
    )
      confirmations++;
  });
  await page.goto('/verify-email#token=malformed');
  await expect(page).toHaveURL(/\/verify-email$/);
  await expect(page.getByText(/Open a valid confirmation link/)).toBeVisible();
  await expect(page.getByLabel('Password', { exact: true })).toHaveCount(0);
  expect(confirmations).toBe(0);
  await page.goto(link);
  const input = page.getByLabel('Password', { exact: true });
  await expect(input).toHaveAttribute('autocomplete', 'current-password');
  await input.focus();
  await page.keyboard.insertText(password);
  expect(confirmations).toBe(0);
  await page.getByRole('button', { name: 'Confirm email address', exact: true }).click();
  await expect(page.getByText('Your email is confirmed', { exact: true })).toBeVisible();
  await page.goto(link);
  await input.fill(password);
  expect(confirmations).toBe(1);
  await page.getByRole('button', { name: 'Confirm email address', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'couldn’t confirm',
  );
  await expect(input).toHaveValue('');
  await expect(
    page.getByRole('link', { name: 'Request another verification email', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible();
  expect(confirmations).toBe(2);
});

test('expired links and lost confirmation responses retain safe recovery actions', async ({
  page,
  api,
}) => {
  await register(page);
  const link = await api.verificationLink();
  api.expireChallenges();
  await page.goto(link);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Confirm email address', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'couldn’t confirm',
  );
  await page.goto('/verify-email/request');
  await page
    .getByLabel('Email address', { exact: true })
    .fill('verification@example.test');
  await page
    .getByRole('button', { name: 'Request verification email', exact: true })
    .click();
  await expect(
    page.getByText('Verification request processed.', { exact: true }),
  ).toBeVisible();
  await expect.poll(async () => (await api.verificationLink()) !== link).toBe(true);
  const fresh = await api.verificationLink();
  await page.goto(fresh);
  await page.route('**/accounts/email-verification/confirm', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fetch();
      await route.abort();
    } else await route.continue();
  });
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Confirm email address', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'may already have been processed',
  );
  await expect(page.getByText('Your email is confirmed', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
  await page.unroute('**/accounts/email-verification/confirm');
  await page.getByRole('link', { name: 'Sign in', exact: true }).click();
  await page
    .getByLabel('Email address', { exact: true })
    .fill('verification@example.test');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('You’re signed in', { exact: true })).toBeVisible();
});
