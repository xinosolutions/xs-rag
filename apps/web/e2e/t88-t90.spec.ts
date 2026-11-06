import { test, expect } from '@playwright/test';

test.describe('Phase 13: Web Admin (T-88..T-90)', () => {
  test('T-88 AC-88: add 2 questions, start run, scores appear on completion, history lists runs, compare page shows deltas for two runs', async ({
    page,
  }) => {
    const timestamp = Date.now();
    const email = `admin_t88_${timestamp}@example.com`;
    const password = 'Password123!';

    // Register & create workspace
    await page.goto('/register');
    await page.fill('input[name="name"]', 'Admin T88');
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', password);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/w$/);
    await page.waitForLoadState('networkidle');

    const wsInput = page.locator('input[id="workspace-name"]');
    await wsInput.waitFor({ state: 'visible' });
    await wsInput.fill('Eval Workspace T88');
    await page.click('button:has-text("Create Workspace")');
    await expect(page).toHaveURL(/\/w\/([^/]+)\/admin\/settings/);

    const match = page.url().match(/\/w\/([^/]+)/);
    const workspaceId = match ? match[1] : '';
    expect(workspaceId).toBeTruthy();

    // Navigate to Evaluation page
    await page.goto(`/w/${workspaceId}/admin/evaluation`);
    await page.waitForLoadState('networkidle');

    // 1. Add question 1 (Answered)
    await page.locator('[data-testid="add-question-btn"]').click();
    await expect(page.locator('[data-testid="eval-question-input"]')).toBeVisible();

    await page.locator('[data-testid="eval-question-input"]').fill('How many vacation days do employees receive?');
    await page.locator('[data-testid="eval-expected-answer-input"]').fill('Employees receive 25 days paid vacation annually.');
    await page.locator('[data-testid="submit-question-btn"]').click();

    await expect(page.locator('text=How many vacation days do employees receive?')).toBeVisible({ timeout: 10000 });

    // 2. Add question 2 (Expect Unanswered)
    await page.locator('[data-testid="add-question-btn"]').click();
    await expect(page.locator('[data-testid="eval-question-input"]')).toBeVisible();

    await page.locator('[data-testid="eval-question-input"]').fill('What is the company stock vesting schedule?');
    await page.locator('[data-testid="eval-expect-unanswered-checkbox"]').check();
    await page.locator('[data-testid="submit-question-btn"]').click();

    await expect(page.locator('text=What is the company stock vesting schedule?')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Expect Unanswered').first()).toBeVisible();

    // 3. Start first evaluation run
    const startRunBtn = page.locator('[data-testid="start-run-btn"]');
    await expect(startRunBtn).toBeEnabled();
    await startRunBtn.click();

    // Status appears and transitions to COMPLETED
    const runStatus = page.locator('[data-testid="run-status"]');
    await expect(runStatus).toBeVisible({ timeout: 10000 });
    await expect(runStatus).toHaveText('COMPLETED', { timeout: 45000 });

    // Scores appear on completion
    const accuracy = page.locator('[data-testid="score-accuracy"]');
    await expect(accuracy).toBeVisible();
    await expect(accuracy).not.toHaveText('-');

    const faithfulness = page.locator('[data-testid="score-faithfulness"]');
    await expect(faithfulness).toBeVisible();

    const retrieval = page.locator('[data-testid="score-retrieval"]');
    await expect(retrieval).toBeVisible();

    // History lists the run
    const runRows = page.locator('[data-testid="eval-run-row"]');
    await expect(runRows).toHaveCount(1, { timeout: 10000 });

    // 4. Start second evaluation run
    await startRunBtn.click();
    await expect(runStatus).toHaveText('COMPLETED', { timeout: 45000 });
    await expect(runRows).toHaveCount(2, { timeout: 10000 });

    // 5. Compare page shows deltas for two runs
    await page.locator('[data-testid="compare-runs-link"]').click();
    await expect(page).toHaveURL(new RegExp(`/w/${workspaceId}/admin/evaluation/compare`));
    await page.waitForLoadState('networkidle');

    // Select base and other runs
    const baseSelect = page.locator('[data-testid="base-run-select"]');
    const otherSelect = page.locator('[data-testid="other-run-select"]');
    await expect(baseSelect).toBeVisible();
    await expect(otherSelect).toBeVisible();

    // Verify deltas and question comparison table
    await expect(page.locator('[data-testid="delta-accuracy"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-testid="delta-faithfulness"]')).toBeVisible();
    await expect(page.locator('[data-testid="delta-retrieval"]')).toBeVisible();

    const compareTable = page.locator('[data-testid="compare-questions-table"]');
    await expect(compareTable).toBeVisible();
    await expect(page.locator('text=How many vacation days do employees receive?')).toBeVisible();
  });

  test('T-89 AC-89: feedback page filter DOWN and "Add to evaluation" opens form and succeeds; analytics page switches period and shows totals and both question tables', async ({
    page,
  }) => {
    const timestamp = Date.now();
    const email = `admin_t89_${timestamp}@example.com`;
    const password = 'Password123!';

    // Register & create workspace
    await page.goto('/register');
    await page.fill('input[name="name"]', 'Admin T89');
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', password);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/w$/);
    await page.waitForLoadState('networkidle');

    const wsInput = page.locator('input[id="workspace-name"]');
    await wsInput.waitFor({ state: 'visible' });
    await wsInput.fill('Feedback Analytics T89');
    await page.click('button:has-text("Create Workspace")');
    await expect(page).toHaveURL(/\/w\/([^/]+)\/admin\/settings/);

    const match = page.url().match(/\/w\/([^/]+)/);
    const workspaceId = match ? match[1] : '';
    expect(workspaceId).toBeTruthy();

    // 1. Go to Chat and generate an answer, then thumbs-down it
    await page.goto(`/w/${workspaceId}/chat`);
    await page.waitForLoadState('networkidle');

    const chatInput = page.locator('[data-testid="chat-input"]');
    const sendBtn = page.locator('[data-testid="send-btn"]');
    await chatInput.fill('What is our remote work policy?');
    await sendBtn.click();

    await expect(page.locator('text=What is our remote work policy?')).toBeVisible();
    await expect(page.locator('[data-testid="thumbs-down-btn"]').first()).toBeVisible({ timeout: 15000 });

    // Rate thumbs down
    await page.locator('[data-testid="thumbs-down-btn"]').first().click();
    await expect(page.locator('[data-testid="thumbs-down-btn"]').first()).toHaveClass(/bg-red-100/);

    // 2. Open Feedback page and filter DOWN
    await page.goto(`/w/${workspaceId}/admin/feedback`);
    await page.waitForLoadState('networkidle');

    const filterDownBtn = page.locator('[data-testid="filter-down"]');
    await expect(filterDownBtn).toBeVisible();
    await filterDownBtn.click();

    // Verify feedback item appears
    const feedbackCard = page.locator('[data-testid="feedback-card"]');
    await expect(feedbackCard.first()).toBeVisible({ timeout: 10000 });
    await expect(feedbackCard.first().locator('text=DOWN')).toBeVisible();

    // 3. "Add to evaluation" opens form and succeeds
    const addToEvalBtn = feedbackCard.first().locator('[data-testid="add-to-eval-btn"]');
    await addToEvalBtn.click();

    const dialog = page.locator('[data-testid="add-to-eval-dialog"]');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('text=What is our remote work policy?')).toBeVisible();

    await dialog.locator('[data-testid="eval-expected-answer-input"]').fill('Employees may work from home two days per week.');
    await dialog.locator('[data-testid="submit-add-to-eval-btn"]').click();

    await expect(dialog).not.toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Successfully added question to evaluation dataset!')).toBeVisible();

    // Verify question is added in Evaluation page
    await page.goto(`/w/${workspaceId}/admin/evaluation`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=What is our remote work policy?')).toBeVisible();

    // 4. Analytics page switches period and shows totals and both question tables
    await page.goto(`/w/${workspaceId}/admin/analytics`);
    await page.waitForLoadState('networkidle');

    // Switch period to 7d
    const period7d = page.locator('[data-testid="period-7d"]');
    await expect(period7d).toBeVisible();
    await period7d.click();

    // Check totals appear
    await expect(page.locator('[data-testid="total-questions"]')).toBeVisible();
    await expect(page.locator('[data-testid="total-unanswered"]')).toBeVisible();
    await expect(page.locator('[data-testid="avg-response-time"]')).toBeVisible();
    await expect(page.locator('[data-testid="total-cost"]')).toBeVisible();

    // Switch period to 30d
    const period30d = page.locator('[data-testid="period-30d"]');
    await period30d.click();

    // Verify both question tables are displayed
    await expect(page.locator('[data-testid="top-questions-table"]')).toBeVisible();
    await expect(page.locator('[data-testid="unanswered-questions-table"]')).toBeVisible();
    // The question we asked appears in both tables
    await expect(page.locator('[data-testid="top-questions-table"]').locator('text=What is our remote work policy?')).toBeVisible();
    await expect(page.locator('[data-testid="unanswered-questions-table"]').locator('text=What is our remote work policy?')).toBeVisible();
  });

  test('T-90 AC-90: create SERVER key: secret shown once with copy; reload shows prefix only; delete; WIDGET key requires origins; snippet contains the key and widget.js URL', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const timestamp = Date.now();
    const email = `admin_t90_${timestamp}@example.com`;
    const password = 'Password123!';

    // Register & create workspace
    await page.goto('/register');
    await page.fill('input[name="name"]', 'Admin T90');
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', password);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/w$/);
    await page.waitForLoadState('networkidle');

    const wsInput = page.locator('input[id="workspace-name"]');
    await wsInput.waitFor({ state: 'visible' });
    await wsInput.fill('API Access Workspace T90');
    await page.click('button:has-text("Create Workspace")');
    await expect(page).toHaveURL(/\/w\/([^/]+)\/admin\/settings/);

    const match = page.url().match(/\/w\/([^/]+)/);
    const workspaceId = match ? match[1] : '';
    expect(workspaceId).toBeTruthy();

    // Navigate to API Access page
    await page.goto(`/w/${workspaceId}/admin/api-access`);
    await page.waitForLoadState('networkidle');

    // 1. Create SERVER key: secret shown once with copy
    await page.locator('[data-testid="create-key-btn"]').click();
    await page.locator('[data-testid="key-name-input"]').fill('Server Integration Key');
    await page.locator('[data-testid="key-kind-select"]').selectOption('SERVER');
    await page.locator('[data-testid="submit-create-key-btn"]').click();

    const secretInput = page.locator('[data-testid="key-secret"]');
    await expect(secretInput).toBeVisible({ timeout: 10000 });
    const fullServerSecret = await secretInput.inputValue();
    expect(fullServerSecret).toMatch(/^xsrag_sk_/);

    const copySecretBtn = page.locator('[data-testid="copy-secret-btn"]');
    await expect(copySecretBtn).toBeVisible();
    await copySecretBtn.click();
    await expect(page.locator('text=Copied')).toBeVisible();

    await page.locator('[data-testid="close-created-modal-btn"]').click();

    // 2. Reload shows prefix only
    await page.reload();
    await page.waitForLoadState('networkidle');

    const keyPrefixElement = page.locator('[data-testid="key-prefix"]').first();
    await expect(keyPrefixElement).toBeVisible();
    const displayedPrefix = await keyPrefixElement.innerText();
    expect(displayedPrefix).toBe(fullServerSecret.slice(0, 12));
    // Verify the full secret is not present in the table
    const tableText = await page.locator('[data-testid="api-keys-table"]').innerText();
    expect(tableText).not.toContain(fullServerSecret);

    // 3. Delete key
    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('[data-testid="delete-key-btn"]').first().click();
    await expect(page.locator('[data-testid="api-key-row"]')).toHaveCount(0, { timeout: 10000 });

    // 4. WIDGET key requires origins
    await page.locator('[data-testid="create-key-btn"]').click();
    await page.locator('[data-testid="key-name-input"]').fill('Widget Client Key');
    await page.locator('[data-testid="key-kind-select"]').selectOption('WIDGET');

    const originsInput = page.locator('[data-testid="allowed-origins-input"]');
    await expect(originsInput).toBeVisible();

    // Clear origins and attempt submit -> fails or prompts required
    await originsInput.fill('');
    await page.locator('[data-testid="submit-create-key-btn"]').click();
    // Modal still open because allowedOrigins is required
    await expect(originsInput).toBeVisible();

    // Now fill valid origins
    await originsInput.fill('http://localhost:3000, https://example.com');
    await page.locator('[data-testid="submit-create-key-btn"]').click();

    // 5. Snippet contains the key and widget.js URL
    const widgetSecretInput = page.locator('[data-testid="key-secret"]');
    await expect(widgetSecretInput).toBeVisible({ timeout: 10000 });
    const fullWidgetSecret = await widgetSecretInput.inputValue();
    expect(fullWidgetSecret).toMatch(/^xsrag_pk_/);

    const snippetElement = page.locator('[data-testid="widget-snippet"]');
    await expect(snippetElement).toBeVisible();
    const snippetText = await snippetElement.innerText();

    expect(snippetText).toContain('widget.js');
    expect(snippetText).toContain(fullWidgetSecret);
    expect(snippetText).toContain('<script src=');

    const copySnippetBtn = page.locator('[data-testid="copy-snippet-btn"]');
    await expect(copySnippetBtn).toBeVisible();
    await copySnippetBtn.click();
    await expect(page.locator('text=Copied Snippet')).toBeVisible();

    await page.locator('[data-testid="close-created-modal-btn"]').click();
  });
});
