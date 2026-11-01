import { test, expect, Page } from "./fixtures";
async function signIn(page: Page) {
  await page.goto("/");
  await page
    .getByLabel("Password", { exact: true })
    .fill("quiccie-test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("#sync-state")).toHaveText("Synced", {
    timeout: 30000,
  });
  await expect(page.locator(".note-card").first()).toBeVisible();
}
test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
test("phone tabs, search, reader, history, and browser Back", async ({
  page,
}) => {
  await signIn(page);
  await expect(page.locator("[data-phone-tab=notes]")).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.locator("[data-phone-filter=all]")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.screenshot({ path: "../.private/mobile-library.png" });
  await page.locator("[data-phone-tab=search]").click();
  await expect(page.locator("#search")).toBeFocused();
  await page.locator("#search").fill("Home Lab/Overview/Service Map.md");
  await page.locator(".note-card").first().click();
  await expect(page.locator("#phone-note-title")).toHaveText("Service Map");
  await expect(page.locator(".phone-nav")).not.toBeVisible();
  await expect(page.locator("#reader table").first()).toBeVisible();
  await page.screenshot({ path: "../.private/mobile-reader.png" });
  await page.locator("#phone-more").click();
  await expect(page.locator("#phone-actions")).toBeVisible();
  await page.screenshot({ path: "../.private/mobile-actions.png" });
  await page.locator("[data-phone-action=history]").click();
  await expect(page.locator("#detail")).toBeVisible();
  await page.goBack();
  await expect(page.locator("#detail")).toBeHidden();
  await expect(page.locator("#reader")).toBeVisible();
  await page.goBack();
  await expect(page.locator("#search")).toHaveValue(
    "Home Lab/Overview/Service Map.md",
  );
  await expect(page.locator(".note-list")).toBeVisible();
  await page.locator("[data-phone-tab=memory]").click();
  await page.locator("[data-phone-tab=browse]").click();await page.locator("[data-phone-tab=projects]").click();
  await expect(page.locator("#folders")).not.toContainText("Work projects");
  await page.locator('[data-folder="Agent Memory/projects/sample-project"]').click();
  await expect(page.locator("#phone-title")).toHaveText("sample-project");
  await page.locator("#phone-folder-back").click();
  await expect(page.locator("#phone-title")).toHaveText("Projects");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
});
test("phone edit, Done, offline source edit, and recovery", async ({
  page,
  context,
}) => {
  await signIn(page);
  const path = "Tests/Phone " + Date.now() + ".md";
  await page.locator("#phone-new").click();
  await page.locator("#new-path").fill(path);
  await page.locator("#create").click();
  await expect(page.locator("#phone-edit")).toHaveText("Done");
  const sizes=await page.locator("#toolbar button").evaluateAll(buttons=>buttons.map(b=>b.getBoundingClientRect().width));
  expect(sizes.every(width=>width>=44)).toBe(true);
  const editor = page.getByRole("textbox", { name: "Note editor" });
  await editor.fill("A phone edit.");
  await page.locator("#phone-edit").click();
  await expect(page.locator("#reader")).toContainText("A phone edit.");
  await expect(page.locator("#toolbar")).toBeHidden();
  await expect
    .poll(
      async () =>
        (
          await (
            await context.request.get(
              "/api/notes?path=" + encodeURIComponent(path),
            )
          ).json()
        ).content,
    )
    .toContain("A phone edit.");
  await context.setOffline(true);
  await page.locator("#phone-more").click();
  await page.locator("[data-phone-action=source]").click();
  await page
    .locator("#source-editor")
    .fill("# Offline phone edit\n\nKeep this text.");
  await page.locator("#phone-edit").click();
  await expect(page.locator("#reader")).toContainText("Keep this text.");
  await page.locator("#phone-back").click();
  await expect(page.locator(".note-list")).toBeVisible();
  await page
    .locator(".note-card")
    .filter({ hasText: path.split("/").pop()!.slice(0, -3) })
    .click();
  await expect(page.locator("#reader")).toContainText("Keep this text.");
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect
    .poll(
      async () =>
        (
          await (
            await context.request.get(
              "/api/notes?path=" + encodeURIComponent(path),
            )
          ).json()
        ).content,
    )
    .toContain("Keep this text.");
});
test("small phone, dark theme, and reachable controls", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await signIn(page);
  await page.locator("#phone-settings").click();
  await page.locator("[data-phone-action=theme]").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.screenshot({ path: "../.private/mobile-dark.png" });
  for (const selector of [
    "#phone-new",
    "#phone-settings",
    "[data-phone-tab=browse]",
    "[data-phone-tab=search]",
  ]) {
    const box = await page.locator(selector).boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  await page.locator("#phone-new").click();
  await page.locator("#cancel-new").click();
  await expect(page.locator("#new-dialog")).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    360,
  );
});
test("landscape touch screen keeps phone navigation", async ({ page }) => {
  await page.setViewportSize({ width: 915, height: 412 });
  await signIn(page);
  await expect(page.locator(".phone-nav")).toBeVisible();
  await expect(page.locator(".sidebar")).toBeHidden();
  await page.locator("[data-phone-tab=browse]").click();await page.locator("[data-phone-tab=files]").click();
  await expect(page.locator(".sidebar")).toBeVisible();
  await expect(page.locator(".main")).toBeHidden();
  await page.locator("#phone-new").click();
  await page.locator("#cancel-new").click();
  await expect(page.locator("#new-dialog")).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    915,
  );
});

test("initial sync does not replace an early tab selection", async ({page}) => {
 let release!:()=>void;
 const gate=new Promise<void>(r=>release=r);
 let pending=false;
 await page.route('**/api/attachments',async route=>{pending=true;await gate;await route.continue();});
 await page.goto('/');
 await page.getByLabel('Password',{exact:true}).fill('quiccie-test-password');
 await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await expect.poll(()=>pending).toBe(true);
 await page.locator('[data-phone-tab=browse]').click();await page.locator('[data-phone-tab=files]').click();
 await expect(page.locator('.workspace')).toHaveAttribute('data-screen','navigation');
 release();
 await expect(page.locator('#sync-state')).toHaveText('Synced');
 await expect(page.locator('[data-phone-tab=files]')).toHaveAttribute('aria-current','page');
 await expect(page.locator('.sidebar')).toBeVisible();
});
