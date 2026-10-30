import { test, expect } from '@playwright/test';

for (const width of [1440, 375]) {
  test(`appearance and motion at ${width}px`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/');
    const theme = page.getByLabel('Appearance', { exact: true });
    await expect(theme).toHaveValue('system');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await theme.selectOption('dark');
    for (const path of ['/', '/register', '/sign-in', '/account']) {
      // Keep account rendering independent of external API availability.
      await page.route('**/accounts/sessions/current', (route) => route.abort());
      await page.goto(path);
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      await expect(page.locator('html')).toHaveCSS('background-color', 'rgb(16, 22, 34)');
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      ).toBe(true);
      await page.screenshot({
        path: `.local/theme-review/dark-${path.replaceAll('/', '') || 'home'}-${width}.png`,
        fullPage: true,
      });
    }
    await page.goto('/register');
    await expect(page.getByLabel('Email address', { exact: true })).toHaveCSS(
      'color',
      'rgb(237, 241, 252)',
    );
    await expect(page.locator('section')).toHaveCSS('animation-name', 'none');
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    await expect(page.getByRole('main').getByRole('alert')).toHaveCSS(
      'color',
      'rgb(255, 180, 191)',
    );
    await page.screenshot({
      path: `.local/theme-review/dark-error-${width}.png`,
      fullPage: true,
    });
    await page.getByLabel('Appearance', { exact: true }).selectOption('light');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(page.locator('html')).toHaveCSS(
      'background-color',
      'rgb(248, 249, 252)',
    );
    await page.getByLabel('Appearance', { exact: true }).selectOption('system');
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'no-preference' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.reload();
    await expect(page.locator('section')).toHaveCSS('animation-duration', '0.36s');
    expect(errors).toEqual([]);
  });
}

test('preference is applied before page content and synchronizes across tabs', async ({
  page,
  context,
}) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await context.addInitScript(() => {
    localStorage.setItem('commerce-theme', 'dark');
    document.addEventListener(
      'DOMContentLoaded',
      () => {
        document.documentElement.dataset.firstPaintTheme =
          document.documentElement.dataset.theme;
      },
      { once: true },
    );
  });
  await page.goto('/register');
  await expect(page.locator('html')).toHaveAttribute('data-first-paint-theme', 'dark');
  const other = await context.newPage();
  await other.goto('/sign-in');
  await page.getByLabel('Appearance', { exact: true }).selectOption('light');
  await expect(other.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(other.getByLabel('Appearance', { exact: true })).toHaveValue('light');
  await other.close();
});

test('blocked storage and invalid preferences preserve usable appearance', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new DOMException('blocked', 'SecurityError');
      },
    });
  });
  await page.goto('/sign-in');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByLabel('Appearance', { exact: true }).selectOption('light');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.getByLabel('Email address', { exact: true })).toBeVisible();
});

test('CSS follows dark system appearance with JavaScript disabled', async ({
  browser,
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    colorScheme: 'dark',
  });
  try {
    const page = await context.newPage();
    await page.goto('/register');
    await expect(page.locator('html')).toHaveCSS('background-color', 'rgb(16, 22, 34)');
    await expect(page.getByLabel('Email address', { exact: true })).toBeVisible();
  } finally {
    await context.close();
  }
});
