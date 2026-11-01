const { _android: android } = require("../web/node_modules/playwright");
const { expect } = require("../web/node_modules/@playwright/test");
const { execFileSync } = require("node:child_process");
const { mkdirSync } = require("node:fs");
// Start scripts/demo.py on port 18090 before this check.
mkdirSync(".private", { recursive: true });
(async () => {
  const devices = await android.devices();
  const device = devices.find((d) => d.serial() === "emulator-5554");
  if (!device) throw new Error("Test emulator is not available.");
  execFileSync(process.env.ADB || "adb", [
    "-s",
    "emulator-5554",
    "reverse",
    "tcp:18090",
    "tcp:18090",
  ]);
  try {
    const context = await device.launchBrowser({ args: ["--no-first-run"] });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    await page.goto("http://localhost:18090");
    await page.evaluate(async () => {
      const r = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "owner",
          password: "quiccie-test-password",
        }),
      });
      if (!r.ok) throw new Error("Test login failed");
    });
    await page.reload();
    await expect(page.locator("#sync-state")).toHaveText("Synced", {
      timeout: 30000,
    });
    await expect(page.locator(".note-card").first()).toBeVisible();
    await page.locator("[data-phone-tab=browse]").click();
    await expect(page.locator('#folders [data-folder="Home Lab"]')).toBeVisible();
    await expect(page.locator('#folders [data-folder*="Agent Memory"]')).toHaveCount(0);
    await page.locator("[data-phone-tab=projects]").click();
    await expect(page.locator('#folders [data-folder="Projects/Field Guide"]')).toBeVisible();
    await page.screenshot({ path: ".private/android-chrome-projects.png" });
    await page.locator('#folders [data-folder="Projects/Field Guide"]').click();
    await expect(page.locator('.folder-card[data-enter-folder="Projects/Field Guide/Research"]')).toBeVisible();
    await page.locator('.note-card[data-path="Projects/Field Guide/Overview.md"]').click();
    await expect(page.locator("#reader")).toBeVisible();
    await page.screenshot({ path: ".private/android-chrome-reader.png" });
    await device.shell("input keyevent 4");
    await expect(page.locator(".note-list")).toBeVisible();
    await page.locator("[data-phone-tab=memory]").click();
    await page.locator("[data-phone-tab=browse]").click();
    await page.locator("[data-phone-tab=projects]").click();
    await expect(page.locator('#folders [data-folder="Agent Memory/projects/sample-project"]')).toBeVisible();
    await page.locator("[data-phone-tab=notes]").click();
    await page.locator("[data-phone-tab=search]").click();
    await page.locator("#search").fill("Service Map");
    await expect(page.locator(".note-card").first()).toBeVisible();
    await device.shell("input keyevent 4");
    await page.locator("[data-phone-tab=notes]").click();
    await page.locator("#phone-new").click();
    await page.locator("#cancel-new").click();
    await expect(page.locator("#new-dialog")).not.toBeVisible();
    await page.locator("#phone-new").click();
    await page.locator("#new-path").fill("../bad");
    await page.locator("#create").click();
    await expect(page.locator("#new-error")).toContainText(
      "relative note path",
    );
    await page.locator("#cancel-new").click();
    await expect(page.locator("#new-dialog")).not.toBeVisible();
    await page.locator("#phone-new").click();
    const keyboardHeight = await page.evaluate(() => window.innerHeight);
    await device.shell("input keyevent 4");
    await expect
      .poll(
        async () =>
          !(await page.locator("#new-dialog").isVisible()) ||
          (await page.evaluate(() => window.innerHeight)) > keyboardHeight,
      )
      .toBe(true);
    if (await page.locator("#new-dialog").isVisible())
      await device.shell("input keyevent 4");
    await expect(page.locator("#new-dialog")).not.toBeVisible();
    const path = "Tests/Android Chrome " + Date.now() + ".md";
    await page.locator("#phone-new").click();
    await page.locator("#new-path").fill(path);
    await page.locator("#create").click();
    const editor = page.getByRole("textbox", { name: "Note editor" });
    await editor.click();
    await editor.fill("An edit with the Android keyboard.");
    await expect(page.locator("#phone-edit")).toBeVisible();
    await expect(page.locator("#toolbar")).toBeVisible();
    await expect
      .poll(async () =>
        page
          .locator("#toolbar")
          .evaluate(
            (el) => el.getBoundingClientRect().bottom <= window.innerHeight,
          ),
      )
      .toBe(true);
    await page.screenshot({ path: ".private/android-chrome-editing.png" });
    await page.locator("#phone-edit").click();
    await expect(page.locator("#reader")).toContainText(
      "An edit with the Android keyboard.",
    );
    await page.locator("#phone-more").click();
    await page.screenshot({ path: ".private/android-chrome-actions.png" });
    await device.shell("input keyevent 4");
    await expect(page.locator("#phone-actions")).toBeHidden();
    await page.locator("#phone-back").click();
    await expect(page.locator(".note-list")).toBeVisible();
    await page.locator("#phone-settings").click();
    await page.locator("[data-phone-action=theme]").click();
    await page.screenshot({ path: ".private/android-chrome-theme.png" });
    console.log(
      "PASS: Android Chrome tabs, projects, search, Back, dialogs, keyboard editing, Done, actions, and theme.",
    );
    await context.close();
  } finally {
    await device.close();
  }
})().catch((e) => {
  console.error(e.stack);
  process.exitCode = 1;
});
