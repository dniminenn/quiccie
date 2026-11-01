import { test, expect } from "./fixtures";
test("save rich text, retain an offline edit, and recover a conflict", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page
    .getByLabel("Password", { exact: true })
    .fill("quiccie-test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("#sync-state")).toContainText("Synced", {
    timeout: 30000,
  });
  const path = "Tests/Browser " + Date.now() + ".md";
  await page.locator("#new-note").click();
  await page.locator("#new-path").fill(path);
  await page.getByRole("button", { name: "Create note", exact: true }).click();
  await expect(page.locator("#note-path")).toHaveAttribute("title",path);
  const editor = page.getByRole("textbox", { name: "Note editor" });
  await editor.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type("A durable browser edit.");
  await page.keyboard.press("Control+s");
  await expect
    .poll(async () => {
      const r = await context.request.get(
        "/api/notes?path=" + encodeURIComponent(path),
      );
      return r.ok() ? (await r.json()).content : "";
    })
    .toContain("A durable browser edit.");
  await context.setOffline(true);
  await editor.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(" An offline edit.");
  await page.keyboard.press("Control+s");
  await expect(page.locator("#save-state")).toContainText(
    "Saved on this device",
  );
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect
    .poll(async () => {
      const r = await context.request.get(
        "/api/notes?path=" + encodeURIComponent(path),
      );
      return (await r.json()).content;
    })
    .toContain("An offline edit.");
  const remote = await (
    await context.request.get("/api/notes?path=" + encodeURIComponent(path))
  ).json();
  await context.setOffline(true);
  await editor.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(" My concurrent edit.");
  await page.keyboard.press("Control+s");
  await page.waitForTimeout(600);
  const agentWrite = await context.request.put("/api/notes", {
    headers: { "X-Quiccie-Request": "1" },
    data: {
      path,
      content: remote.content + "\nAn agent edit.\n",
      expected_checksum: remote.checksum,
      operation_id: crypto.randomUUID(),
      deleted: false,
    },
  });
  expect(agentWrite.status()).toBe(200);
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.locator("#conflict")).toBeVisible();
  await page.getByRole("button", { name: "Compare versions" }).click();
  await expect(page.locator("#detail")).toContainText("An agent edit.");
  await page
    .getByRole("button", {
      name: "Use saved version; keep my edit in Conflicts",
    })
    .click();
  await expect(page.locator("#conflict")).toBeHidden();
  await expect(page.locator("#reader")).toContainText("An agent edit.");
  await page.screenshot({
    path: "../.private/browser-editor.png",
    fullPage: true,
  });
});
test("reopen offline and keep an attachment", async ({ page, context }) => {
  await page.goto("/");
  await page
    .getByLabel("Password", { exact: true })
    .fill("quiccie-test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("#sync-state")).toContainText("Synced", {
    timeout: 30000,
  });
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect(page.locator("#sync-state")).toContainText("Synced", {
    timeout: 30000,
  });
  const path = "Tests/Offline restart " + Date.now() + ".md";
  await page.locator("#new-note").click();
  await page.locator("#new-path").fill(path);
  await page.getByRole("button", { name: "Create note", exact: true }).click();
  await expect(page.locator("#note-path")).toHaveAttribute("title",path);
  await context.setOffline(true);
  await page
    .locator("#file")
    .setInputFiles({
      name: "offline.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("A local file."),
    });
  await expect(page.locator("#save-state")).toContainText(
    "Saved on this device",
  );
  await page.reload();
  await expect(page.locator("#note-items")).toContainText("Offline restart");
  await page.locator("#search").fill(path);
  await page.locator(".note-card").click();
  await expect(
    page.locator("#reader"),
  ).toContainText("offline.txt");
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.locator("#sync-state")).toContainText("Synced", {
    timeout: 30000,
  });
});
