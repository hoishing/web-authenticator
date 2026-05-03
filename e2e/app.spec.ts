import { expect, test } from "@playwright/test";

const sampleImport = [
  "otpauth://totp/GitHub:hoishing?secret=GN5XTWHRJIE2QW5O&issuer=GitHub",
  "otpauth://totp/NVIDIA:hoishing%40gmail.com?secret=IFYFG6SRNR5EOYJNKEWVIMSFPBEDCZSB&issuer=NVIDIA",
].join("\n");

async function clearDatabase(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase("web-authenticator");
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      request.onblocked = () => resolve();
    });
  });
  await page.reload();
}

test.beforeEach(async ({ context, page }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await clearDatabase(page);
});

test("adds a TOTP record and copies passcode and secret", async ({ page }) => {
  await page.getByLabel("New record description").fill("GitHub:hoishing");
  await page.getByLabel("New record secret").fill("GN5XTWHRJIE2QW5O");
  await page.getByRole("button", { name: "Add" }).click();

  await expect(page.getByText("GitHub:hoishing")).toBeVisible();
  const passcode = page.getByRole("button", { name: /Copy passcode for GitHub:hoishing/ });
  await expect(passcode).toHaveText(/^\d{6}$/);

  await passcode.click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toMatch(/^\d{6}$/);

  await page.getByRole("button", { name: "Copy secret for GitHub:hoishing" }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe("GN5XTWHRJIE2QW5O");
});

test("imports, filters, edits, deletes, persists, and exposes PWA metadata", async ({ page }) => {
  await page.getByLabel("TOTP tools").getByRole("button", { name: "Import" }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "secrets.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(sampleImport),
  });

  await expect(page.getByText("GitHub:hoishing")).toBeVisible();
  await expect(page.getByText("NVIDIA:hoishing@gmail.com")).toBeVisible();
  await expect(page.getByLabel("Remaining seconds")).toHaveText(/^\d+s$/);

  await page.getByLabel("Search records").fill("nvhg");
  await expect(page.getByText("NVIDIA:hoishing@gmail.com")).toBeVisible();
  await expect(page.getByText("GitHub:hoishing")).toBeHidden();

  await page.getByRole("button", { name: "Edit NVIDIA:hoishing@gmail.com" }).click();
  await page.getByLabel("Edit description for NVIDIA:hoishing@gmail.com").fill("NVIDIA work");
  await page.getByRole("button", { name: "Save description" }).click();
  await page.getByLabel("Search records").fill("");
  await expect(page.getByText("NVIDIA work")).toBeVisible();

  await page.reload();
  await expect(page.getByText("NVIDIA work")).toBeVisible();

  await page.getByRole("button", { name: "Delete NVIDIA work" }).click();
  await expect(page.getByText("NVIDIA work")).toBeHidden();

  const manifest = await page.request.get("/manifest.webmanifest");
  await expect(manifest).toBeOK();
  expect(manifest.headers()["content-type"]).toMatch(/application\/manifest\+json/);
  expect((await manifest.json()).theme_color).toBe("#ff9a00");

  const serviceWorker = await page.request.get("/service-worker.js");
  await expect(serviceWorker).toBeOK();
});

test("uses the requested HeroUI theme and add-record layout", async ({ page }) => {
  const layout = await page.evaluate(() => {
    const toolbar = document.querySelector<HTMLElement>(".toolbar");
    const search = document.querySelector<HTMLElement>(".search-field");
    const countdown = document.querySelector<HTMLElement>(".countdown");
    const list = document.querySelector<HTMLElement>(".totp-list");
    const addForm = document.querySelector<HTMLElement>(".add-form");
    const descriptionInput = document.querySelector<HTMLInputElement>('[aria-label="New record description"]');
    const secretInput = document.querySelector<HTMLInputElement>('[aria-label="New record secret"]');

    if (!toolbar || !search || !countdown || !list || !addForm || !descriptionInput || !secretInput) {
      throw new Error("Missing layout elements");
    }

    const searchRect = search.getBoundingClientRect();
    const countdownRect = countdown.getBoundingClientRect();
    const listRect = list.getBoundingClientRect();
    const addRect = addForm.getBoundingClientRect();
    const descriptionStyle = getComputedStyle(descriptionInput);
    const secretStyle = getComputedStyle(secretInput);
    const rootStyle = getComputedStyle(document.documentElement);

    return {
      addFormBelowList: addRect.top > listRect.bottom,
      searchWiderThanCountdown: searchRect.width > countdownRect.width * 4,
      fontSize: getComputedStyle(document.documentElement).fontSize,
      accent: rootStyle.getPropertyValue("--accent").trim(),
      background: rootStyle.getPropertyValue("--background").trim(),
      fieldBackground: rootStyle.getPropertyValue("--field-background").trim(),
      radius: rootStyle.getPropertyValue("--radius").trim(),
      fontSans: rootStyle.getPropertyValue("--font-sans").trim(),
      descriptionBackground: descriptionStyle.backgroundColor,
      descriptionColor: descriptionStyle.color,
      secretBackground: secretStyle.backgroundColor,
      secretColor: secretStyle.color,
      toolbarDisplay: getComputedStyle(toolbar).display,
    };
  });

  expect(layout.addFormBelowList).toBe(true);
  expect(layout.searchWiderThanCountdown).toBe(true);
  expect(layout.fontSize).toBe("14.4px");
  expect(layout.accent).toMatch(/^oklch\(77\.36% 0?\.1735 65\.05\)$/);
  expect(layout.background).toMatch(/^oklch\(12(?:\.00)?% 0(?:\.0000)? 65\.05\)$/);
  expect(layout.fieldBackground).toMatch(/^oklch\(21\.03% 0(?:\.0000)? 65\.05\)$/);
  expect(layout.radius).toMatch(/^0?\.25rem$/);
  expect(layout.fontSans).toContain("Instrument Sans");
  expect(layout.descriptionBackground).not.toBe("rgb(243, 237, 246)");
  expect(layout.descriptionColor).not.toBe("rgb(32, 21, 34)");
  expect(layout.secretBackground).not.toBe("rgb(243, 237, 246)");
  expect(layout.secretColor).not.toBe("rgb(32, 21, 34)");
  expect(layout.toolbarDisplay).toBe("flex");
});

test("exports imported records as otpauth text", async ({ page }) => {
  const downloadPromise = page.waitForEvent("download");
  await page.getByLabel("TOTP tools").getByRole("button", { name: "Import" }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "secrets.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(sampleImport),
  });
  await page.getByRole("button", { name: "Export" }).click();

  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];

  await new Promise<void>((resolve, reject) => {
    if (!stream) {
      reject(new Error("Missing download stream"));
      return;
    }

    stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on("end", resolve);
    stream.on("error", reject);
  });

  const text = Buffer.concat(chunks).toString("utf8");
  expect(text).toContain("otpauth://totp/GitHub%3Ahoishing?secret=GN5XTWHRJIE2QW5O");
  expect(text).toContain("otpauth://totp/NVIDIA%3Ahoishing%40gmail.com?secret=IFYFG6SRNR5EOYJNKEWVIMSFPBEDCZSB");
});
