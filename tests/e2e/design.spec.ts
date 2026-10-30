import {test,expect} from '@playwright/test';

for (const width of [1440,375]) {
  test(`account design and interactions at ${width}px`,async({page})=>{
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.setViewportSize({width,height:1000});
    for (const route of ['/', '/register', '/sign-in']) {
      await page.goto(route);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      await page.screenshot({path:`.local/design-review/${route.replaceAll('/','') || 'home'}-${width}.png`,fullPage:true});
    }
    const input=page.getByLabel('Email address',{exact:true});
    await expect(input).toHaveCSS('cursor','text');
    const button=page.getByRole('button',{name:'Sign in',exact:true});
    await expect(button).toHaveCSS('cursor','pointer');
    expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await button.click();
    await expect(input).toBeFocused();
    await expect(input).toHaveAttribute('aria-invalid','true');
    await expect(page.getByRole('main').getByRole('alert')).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Password',{exact:true})).toBeFocused();
    await page.keyboard.press('Tab');
    const reveal=page.getByRole('button',{name:'Show password'});
    await expect(reveal).toBeFocused();
    expect((await reveal.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await page.keyboard.press('Enter');
    await expect(page.getByLabel('Password',{exact:true})).toHaveAttribute('type','text');
    await page.screenshot({path:`.local/design-review/validation-${width}.png`,fullPage:true});
  });
}
