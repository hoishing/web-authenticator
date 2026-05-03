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
  await expect(passcode.locator("svg")).toBeVisible();

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
  await expect(page.getByRole("columnheader", { name: "Actions" })).toBeVisible();

  const rowActions = await page.locator(".record-row").first().evaluate((row) => {
    const actionButtons = [...row.querySelectorAll<HTMLButtonElement>(".record-actions .button")];
    const passcodeButton = row.querySelector<HTMLButtonElement>(".passcode-button");
    const passcodeIcon = row.querySelector<SVGElement>(".passcode-button svg");
    const widths = actionButtons.map((button) => button.getBoundingClientRect().width);
    const heights = actionButtons.map((button) => button.getBoundingClientRect().height);
    const lefts = actionButtons.map((button) => button.getBoundingClientRect().left);
    const gaps = lefts.slice(1).map((left, index) => left - (lefts[index] + widths[index]));

    if (!passcodeButton) {
      throw new Error("Missing passcode button");
    }

    return {
      buttonCount: actionButtons.length,
      secondaryCount: actionButtons.filter((button) => button.classList.contains("button--secondary")).length,
      equalWidths: Math.max(...widths) - Math.min(...widths) < 1,
      equalGaps: Math.max(...gaps) - Math.min(...gaps) < 1,
      passcodeText: passcodeButton.innerText.trim(),
      passcodeHasCopyIcon: Boolean(passcodeIcon),
      passcodeIsCompact: passcodeButton.getBoundingClientRect().height <= heights[0],
    };
  });

  expect(rowActions).toEqual({
    buttonCount: 3,
    secondaryCount: 3,
    equalWidths: true,
    equalGaps: true,
    passcodeText: expect.stringMatching(/^\d{6}$/),
    passcodeHasCopyIcon: true,
    passcodeIsCompact: true,
  });

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
  await expect(page.locator(".notice")).toHaveCount(0);
  const toastRegion = page.locator('[data-slot="toast-region"]');
  await expect(toastRegion).toHaveClass(/toast-region--top/);
  await expect(toastRegion.getByText("Record deleted.")).toBeVisible();

  const manifest = await page.request.get("/manifest.webmanifest");
  await expect(manifest).toBeOK();
  expect(manifest.headers()["content-type"]).toMatch(/application\/manifest\+json/);
  expect((await manifest.json()).theme_color).toBe("#ff9a00");

  const serviceWorker = await page.request.get("/service-worker.js");
  await expect(serviceWorker).toBeOK();

  await page.evaluate(async () => {
    await navigator.serviceWorker.register("/service-worker.js");
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Web Authenticator" })).toBeVisible();
  await expect(page.getByText("GitHub:hoishing")).toBeVisible();
  await expect(page.getByText("Loading records...")).toBeHidden();

  await page.getByLabel("TOTP tools").getByRole("button", { name: "Clear" }).click();
  await expect(page.getByText("GitHub:hoishing")).toBeHidden();
  await expect(page.getByText("No TOTP records yet.")).toBeVisible();

  await page.reload();
  await expect(page.getByText("No TOTP records yet.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Export" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Clear" })).toBeDisabled();
});

test("uses the requested HeroUI theme and add-record layout", async ({ page }) => {
  await page.getByLabel("New record description").fill("GitHub:hoishing");
  await page.getByLabel("New record secret").fill("GN5XTWHRJIE2QW5O");
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByText("GitHub:hoishing")).toBeVisible();
  await page.getByLabel("New record description").fill("NVIDIA:hoishing@gmail.com");
  await page.getByLabel("New record secret").fill("IFYFG6SRNR5EOYJNKEWVIMSFPBEDCZSB");
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByText("NVIDIA:hoishing@gmail.com")).toBeVisible();

  await page.getByLabel("Search records").fill("Git");
  const searchClearButtonRadius = await page
    .getByLabel("TOTP tools")
    .getByRole("button", { name: "Close" })
    .evaluate((button) => getComputedStyle(button).borderTopLeftRadius);
  await page.getByLabel("Search records").fill("");
  await expect(page.getByText("NVIDIA:hoishing@gmail.com")).toBeVisible();

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
    const toolbarRect = toolbar.getBoundingClientRect();
    const descriptionStyle = getComputedStyle(descriptionInput);
    const secretStyle = getComputedStyle(secretInput);
    const rootStyle = getComputedStyle(document.documentElement);
    const appShell = document.querySelector<HTMLElement>(".app-shell");
    const heading = document.querySelector<HTMLHeadingElement>("h1");
    const subtitle = document.querySelector<HTMLElement>(".top-bar p");
    const searchGroup = document.querySelector<HTMLElement>(".search-field__group");
    const importButton = toolbar.querySelector<HTMLButtonElement>(".utility-button");
    const exportButton = [...toolbar.querySelectorAll<HTMLButtonElement>(".utility-button")].find((button) => button.textContent?.includes("Export"));
    const clearButton = [...toolbar.querySelectorAll<HTMLButtonElement>(".utility-button")].find((button) => button.textContent?.includes("Clear"));
    const listHeader = document.querySelector<HTMLElement>(".list-header");
    const recordRow = document.querySelector<HTMLElement>(".record-row");
    const recordRows = [...document.querySelectorAll<HTMLElement>(".record-row")];
    const passcodeButton = document.querySelector<HTMLElement>(".passcode-button");
    const descriptionText = document.querySelector<HTMLElement>(".description-text");
    const searchInput = searchGroup.querySelector<HTMLInputElement>("input");
    const brandMark = document.querySelector<HTMLElement>(".brand-mark");
    const addButton = addForm.querySelector<HTMLButtonElement>(".add-button");
    const addFieldLabels = [...addForm.querySelectorAll<HTMLElement>("label")];
    const actionButton = document.querySelector<HTMLElement>(".record-actions .button");
    const firstHeaderCell = document.querySelector<HTMLElement>('.list-header [role="columnheader"]:first-child');
    const lastHeaderCell = document.querySelector<HTMLElement>('.list-header [role="columnheader"]:last-child');

    if (!appShell || !heading || !subtitle || !searchGroup || !importButton || !exportButton || !clearButton || !listHeader || !recordRow || recordRows.length < 2 || !passcodeButton || !descriptionText || !searchInput || !brandMark || !addButton || addFieldLabels.length !== 2 || !actionButton || !firstHeaderCell || !lastHeaderCell) {
      throw new Error("Missing toolbar controls");
    }

    const resolveRadius = (value: string) => {
      const probe = document.createElement("div");
      probe.style.borderRadius = value;
      document.body.append(probe);
      const radius = getComputedStyle(probe).borderTopLeftRadius;
      probe.remove();
      return radius;
    };

    const appRect = appShell.getBoundingClientRect();
    const searchGroupRect = searchGroup.getBoundingClientRect();
    const importButtonRect = importButton.getBoundingClientRect();
    const exportButtonRect = exportButton.getBoundingClientRect();
    const clearButtonRect = clearButton.getBoundingClientRect();
    const listHeaderStyle = getComputedStyle(listHeader);
    const recordRowStyle = getComputedStyle(recordRow);
    const lastRecordRow = recordRows[recordRows.length - 1];
    const lastRecordRowStyle = getComputedStyle(lastRecordRow);
    const passcodeStyle = getComputedStyle(passcodeButton);
    const descriptionTextStyle = getComputedStyle(descriptionText);
    const addButtonRect = addButton.getBoundingClientRect();
    const addButtonSvg = addButton.querySelector("svg");

    return {
      addFormBelowList: addRect.top > listRect.bottom,
      searchWiderThanCountdown: searchRect.width > countdownRect.width * 4,
      toolbarFillsAppShell: Math.abs(toolbarRect.width - appRect.width) < 1,
      searchGroupFillsSearchField: Math.abs(searchGroupRect.width - searchRect.width) < 1,
      searchConsumesRemainingToolbarSpace: searchRect.right < countdownRect.left && searchRect.width > toolbarRect.width / 2,
      searchHeight: Math.round(searchGroupRect.height),
      countdownHeight: Math.round(countdownRect.height),
      importWidth: Math.round(importButtonRect.width),
      exportWidth: Math.round(exportButtonRect.width),
      clearWidth: Math.round(clearButtonRect.width),
      importHeight: Math.round(importButtonRect.height),
      exportHeight: Math.round(exportButtonRect.height),
      clearHeight: Math.round(clearButtonRect.height),
      importInToolbar: toolbar.contains(importButton),
      exportInToolbar: toolbar.contains(exportButton),
      clearInToolbar: toolbar.contains(clearButton),
      clearRightOfExport: clearButtonRect.left > exportButtonRect.right,
      fontSize: getComputedStyle(document.documentElement).fontSize,
      bodyFontSize: getComputedStyle(document.body).fontSize,
      headingFontSize: Number.parseFloat(getComputedStyle(heading).fontSize),
      subtitleFontSize: Number.parseFloat(getComputedStyle(subtitle).fontSize),
      toolbarButtonFontSize: getComputedStyle(importButton).fontSize,
      toolbarButtonFontWeights: [importButton, exportButton, clearButton].map((button) => getComputedStyle(button).fontWeight),
      countdownFontWeight: getComputedStyle(countdown).fontWeight,
      searchInputFontSize: getComputedStyle(searchInput).fontSize,
      listHeaderFontSize: listHeaderStyle.fontSize,
      listHeaderTextTransform: listHeaderStyle.textTransform,
      recordRowFontSize: recordRowStyle.fontSize,
      recordRowHeight: Math.round(recordRow.getBoundingClientRect().height),
      listBackground: getComputedStyle(list).backgroundColor,
      listPadding: getComputedStyle(list).padding,
      listHeaderBackground: listHeaderStyle.backgroundColor,
      recordRowBackground: recordRowStyle.backgroundColor,
      listHeaderTopLeftRadius: listHeaderStyle.borderTopLeftRadius,
      listHeaderTopRightRadius: listHeaderStyle.borderTopRightRadius,
      firstHeaderCellRadius: getComputedStyle(firstHeaderCell).borderTopLeftRadius,
      lastHeaderCellRadius: getComputedStyle(lastHeaderCell).borderTopRightRadius,
      firstRowTopLeftRadius: recordRowStyle.borderTopLeftRadius,
      firstRowTopRightRadius: recordRowStyle.borderTopRightRadius,
      firstRowBottomLeftRadius: recordRowStyle.borderBottomLeftRadius,
      lastRowBottomLeftRadius: lastRecordRowStyle.borderBottomLeftRadius,
      lastRowBottomRightRadius: lastRecordRowStyle.borderBottomRightRadius,
      brandMarkRadius: getComputedStyle(brandMark).borderTopLeftRadius,
      addFormRadius: getComputedStyle(addForm).borderTopLeftRadius,
      searchGroupRadius: getComputedStyle(searchGroup).borderTopLeftRadius,
      countdownRadius: getComputedStyle(countdown).borderTopLeftRadius,
      importRadius: getComputedStyle(importButton).borderTopLeftRadius,
      exportRadius: getComputedStyle(exportButton).borderTopLeftRadius,
      clearRadius: getComputedStyle(clearButton).borderTopLeftRadius,
      listRadius: getComputedStyle(list).borderTopLeftRadius,
      passcodeRadius: passcodeStyle.borderTopLeftRadius,
      passcodeFontWeight: passcodeStyle.fontWeight,
      descriptionFontWeight: descriptionTextStyle.fontWeight,
      addButtonRadius: getComputedStyle(addButton).borderTopLeftRadius,
      addButtonWidth: Math.round(addButtonRect.width),
      addButtonHeight: Math.round(addButtonRect.height),
      addButtonText: addButton.innerText.trim(),
      addButtonHasIcon: Boolean(addButtonSvg),
      addButtonIsSecondary: addButton.classList.contains("button--secondary"),
      actionButtonRadius: getComputedStyle(actionButton).borderTopLeftRadius,
      addLabelWidths: addFieldLabels.map((label) => Math.round(label.getBoundingClientRect().width)),
      addLabelFontWeights: addFieldLabels.map((label) => getComputedStyle(label).fontWeight),
      addInputWidths: [descriptionInput, secretInput].map((input) => Math.round(input.getBoundingClientRect().width)),
      addInputFontWeights: [descriptionStyle.fontWeight, secretStyle.fontWeight],
      rowInsetLeft: Math.round(recordRow.getBoundingClientRect().left - listRect.left),
      rowInsetRight: Math.round(listRect.right - recordRow.getBoundingClientRect().right),
      passcodeFontSize: passcodeStyle.fontSize,
      passcodeBackground: passcodeStyle.backgroundColor,
      accent: rootStyle.getPropertyValue("--accent").trim(),
      background: rootStyle.getPropertyValue("--background").trim(),
      fieldBackground: rootStyle.getPropertyValue("--field-background").trim(),
      radius: rootStyle.getPropertyValue("--radius").trim(),
      fieldRadius: rootStyle.getPropertyValue("--field-radius").trim(),
      surfaceRadius: rootStyle.getPropertyValue("--surface-radius").trim(),
      toolbarControlHeight: rootStyle.getPropertyValue("--toolbar-control-height").trim(),
      resolvedSurfaceRadius: resolveRadius("var(--surface-radius)"),
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
  expect(layout.toolbarFillsAppShell).toBe(true);
  expect(layout.searchGroupFillsSearchField).toBe(true);
  expect(layout.searchConsumesRemainingToolbarSpace).toBe(true);
  expect(layout.searchHeight).toBe(36);
  expect(layout.countdownHeight).toBe(layout.searchHeight);
  expect(layout.importWidth).toBe(layout.exportWidth);
  expect(layout.clearWidth).toBe(layout.exportWidth);
  expect(layout.importHeight).toBe(layout.searchHeight);
  expect(layout.exportHeight).toBe(layout.searchHeight);
  expect(layout.clearHeight).toBe(layout.searchHeight);
  expect(layout.importInToolbar).toBe(true);
  expect(layout.exportInToolbar).toBe(true);
  expect(layout.clearInToolbar).toBe(true);
  expect(layout.clearRightOfExport).toBe(true);
  expect(layout.fontSize).toBe("16px");
  expect(layout.bodyFontSize).toBe("16px");
  expect(layout.headingFontSize).toBeCloseTo(20.16, 2);
  expect(layout.subtitleFontSize).toBeCloseTo(12.8, 2);
  expect(layout.toolbarButtonFontSize).toBe("14px");
  expect(layout.toolbarButtonFontWeights).toEqual(["400", "400", "400"]);
  expect(layout.countdownFontWeight).toBe("400");
  expect(layout.searchInputFontSize).toBe("14px");
  expect(layout.listHeaderFontSize).toBe("12px");
  expect(layout.listHeaderTextTransform).toBe("none");
  expect(layout.recordRowFontSize).toBe("14px");
  expect(layout.recordRowHeight).toBeLessThanOrEqual(60);
  expect(layout.listPadding).toBe("0px 4px 4px");
  expect(layout.listBackground).toBe(layout.listHeaderBackground);
  expect(layout.recordRowBackground).not.toBe(layout.listHeaderBackground);
  expect(layout.listHeaderTopLeftRadius).toBe(layout.resolvedSurfaceRadius);
  expect(layout.listHeaderTopRightRadius).toBe(layout.resolvedSurfaceRadius);
  expect(layout.firstHeaderCellRadius).toBe(layout.resolvedSurfaceRadius);
  expect(layout.lastHeaderCellRadius).toBe(layout.resolvedSurfaceRadius);
  expect(layout.firstRowTopLeftRadius).toBe(layout.resolvedSurfaceRadius);
  expect(layout.firstRowTopRightRadius).toBe(layout.resolvedSurfaceRadius);
  expect(layout.firstRowBottomLeftRadius).toBe("0px");
  expect(layout.lastRowBottomLeftRadius).toBe(layout.resolvedSurfaceRadius);
  expect(layout.lastRowBottomRightRadius).toBe(layout.resolvedSurfaceRadius);
  expect(layout.brandMarkRadius).toBe(layout.resolvedSurfaceRadius);
  expect(layout.addFormRadius).toBe(layout.resolvedSurfaceRadius);
  expect(layout.searchGroupRadius).toBe(layout.resolvedSurfaceRadius);
  expect(layout.countdownRadius).toBe(layout.resolvedSurfaceRadius);
  expect(layout.importRadius).toBe(layout.resolvedSurfaceRadius);
  expect(layout.exportRadius).toBe(layout.resolvedSurfaceRadius);
  expect(layout.clearRadius).toBe(layout.resolvedSurfaceRadius);
  expect(layout.listRadius).toBe(layout.resolvedSurfaceRadius);
  expect(layout.passcodeRadius).toBe(layout.resolvedSurfaceRadius);
  expect(layout.passcodeFontWeight).toBe("400");
  expect(layout.descriptionFontWeight).toBe("400");
  expect(layout.addButtonRadius).toBe(layout.resolvedSurfaceRadius);
  expect(layout.addButtonWidth).toBe(36);
  expect(layout.addButtonHeight).toBe(36);
  expect(layout.addButtonText).toBe("");
  expect(layout.addButtonHasIcon).toBe(true);
  expect(layout.addButtonIsSecondary).toBe(true);
  expect(layout.actionButtonRadius).toBe(layout.resolvedSurfaceRadius);
  expect(layout.addLabelWidths[0]).toBeGreaterThan(200);
  expect(layout.addLabelWidths[1]).toBe(layout.addLabelWidths[0]);
  expect(layout.addLabelFontWeights).toEqual(["400", "400"]);
  expect(layout.addInputWidths).toEqual(layout.addLabelWidths);
  expect(layout.addInputFontWeights).toEqual(["400", "400"]);
  expect(searchClearButtonRadius).toBe(layout.resolvedSurfaceRadius);
  expect(layout.rowInsetLeft).toBe(4);
  expect(layout.rowInsetRight).toBe(4);
  expect(layout.passcodeFontSize).toBe("14px");
  expect(layout.passcodeBackground).toBe("rgba(0, 0, 0, 0)");
  expect(layout.accent).toMatch(/^oklch\(77\.36% 0?\.1735 65\.05\)$/);
  expect(layout.background).toMatch(/^oklch\(12(?:\.00)?% 0(?:\.0000)? 65\.05\)$/);
  expect(layout.fieldBackground).toMatch(/^oklch\(21\.03% 0(?:\.0000)? 65\.05\)$/);
  expect(layout.radius).toMatch(/^0?\.25rem$/);
  expect(layout.fieldRadius).toMatch(/^0?\.5rem$/);
  expect(layout.surfaceRadius).toMatch(/^(?:var\(--field-radius\)|0?\.5rem)$/);
  expect(layout.toolbarControlHeight).toBe("2.25rem");
  expect(layout.fontSans).toContain("Instrument Sans");
  expect(layout.descriptionBackground).not.toBe("rgb(243, 237, 246)");
  expect(layout.descriptionColor).not.toBe("rgb(32, 21, 34)");
  expect(layout.secretBackground).not.toBe("rgb(243, 237, 246)");
  expect(layout.secretColor).not.toBe("rgb(32, 21, 34)");
  expect(layout.toolbarDisplay).toBe("flex");

  await page.setViewportSize({ width: 520, height: 720 });

  const compactAddForm = await page.evaluate(() => {
    const addForm = document.querySelector<HTMLElement>(".add-form");
    const addFieldLabels = [...document.querySelectorAll<HTMLElement>(".add-form label")];
    const descriptionInput = document.querySelector<HTMLInputElement>('[aria-label="New record description"]');
    const secretInput = document.querySelector<HTMLInputElement>('[aria-label="New record secret"]');

    if (!addForm || addFieldLabels.length !== 2 || !descriptionInput || !secretInput) {
      throw new Error("Missing narrow add-form elements");
    }

    return {
      formHasNoHorizontalOverflow: addForm.scrollWidth <= addForm.clientWidth + 1,
      labelWidths: addFieldLabels.map((label) => Math.round(label.getBoundingClientRect().width)),
      labelTops: addFieldLabels.map((label) => Math.round(label.getBoundingClientRect().top)),
      inputWidths: [descriptionInput, secretInput].map((input) => Math.round(input.getBoundingClientRect().width)),
    };
  });

  expect(compactAddForm.formHasNoHorizontalOverflow).toBe(true);
  expect(compactAddForm.labelWidths.every((width) => width >= 200)).toBe(true);
  expect(compactAddForm.labelWidths[1]).toBe(compactAddForm.labelWidths[0]);
  expect(compactAddForm.labelTops[1]).toBe(compactAddForm.labelTops[0]);
  expect(compactAddForm.inputWidths).toEqual(compactAddForm.labelWidths);

  await page.setViewportSize({ width: 480, height: 720 });

  const stackedAddForm = await page.evaluate(() => {
    const addForm = document.querySelector<HTMLElement>(".add-form");
    const addFieldLabels = [...document.querySelectorAll<HTMLElement>(".add-form label")];
    const descriptionInput = document.querySelector<HTMLInputElement>('[aria-label="New record description"]');
    const secretInput = document.querySelector<HTMLInputElement>('[aria-label="New record secret"]');

    if (!addForm || addFieldLabels.length !== 2 || !descriptionInput || !secretInput) {
      throw new Error("Missing stacked add-form elements");
    }

    return {
      formHasNoHorizontalOverflow: addForm.scrollWidth <= addForm.clientWidth + 1,
      labelWidths: addFieldLabels.map((label) => Math.round(label.getBoundingClientRect().width)),
      labelTops: addFieldLabels.map((label) => Math.round(label.getBoundingClientRect().top)),
      inputWidths: [descriptionInput, secretInput].map((input) => Math.round(input.getBoundingClientRect().width)),
    };
  });

  expect(stackedAddForm.formHasNoHorizontalOverflow).toBe(true);
  expect(stackedAddForm.labelWidths[1]).toBe(stackedAddForm.labelWidths[0]);
  expect(stackedAddForm.labelTops[1]).toBeGreaterThan(stackedAddForm.labelTops[0]);
  expect(stackedAddForm.inputWidths).toEqual(stackedAddForm.labelWidths);
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
