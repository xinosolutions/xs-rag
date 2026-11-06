import { test, expect } from '@playwright/test';
import { execSync } from 'node:child_process';
import { LockedCopy } from '@xs-rag/shared';

test.describe('Phase 14: Web Public, Demo, Embed, and Widget (T-91 & T-68)', () => {
  test.beforeEach(() => {
    try {
      execSync(
        'node -e "const { PrismaClient } = require(\'../api/node_modules/@prisma/client\'); const p = new PrismaClient(); p.chat.deleteMany({ where: { visitorId: { not: null } } }).then(() => process.exit(0)).catch(() => process.exit(0));"',
        { stdio: 'ignore' }
      );
    } catch {
      // ignore
    }
  });
  test('T-68 AC-68 (web part): GET /embed/<key> response header Content-Security-Policy contains frame-ancestors; unknown key -> 404 page', async ({
    page,
    request,
  }) => {
    const timestamp = Date.now();
    const email = `admin_t68_${timestamp}@example.com`;
    const password = 'Password123!';

    // 1. Register and create a workspace
    await page.goto('/register');
    await page.fill('input[name="name"]', 'Admin T68');
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');

    const wsInput = page.locator('input[id="workspace-name"]');
    await wsInput.waitFor({ state: 'visible' });
    await wsInput.fill('Widget Workspace T68');
    await page.click('button:has-text("Create Workspace")');
    await expect(page).toHaveURL(/\/w\/([^/]+)\/admin\/settings/);

    const match = page.url().match(/\/w\/([^/]+)/);
    const workspaceId = match ? match[1] : '';
    expect(workspaceId).toBeTruthy();

    // 2. Navigate to API Access page and create a WIDGET key with allowedOrigins
    await page.goto(`/w/${workspaceId}/admin/api-access`);
    await page.waitForLoadState('networkidle');

    await page.locator('[data-testid="create-key-btn"]').click();
    await page.locator('[data-testid="key-name-input"]').fill('Embed Widget Key');
    await page.locator('[data-testid="key-kind-select"]').selectOption('WIDGET');

    const originsInput = page.locator('[data-testid="allowed-origins-input"]');
    await originsInput.fill('https://site.example, http://localhost:3000');
    await page.locator('[data-testid="submit-create-key-btn"]').click();

    const widgetSecretInput = page.locator('[data-testid="key-secret"]');
    await expect(widgetSecretInput).toBeVisible({ timeout: 10000 });
    const widgetKey = await widgetSecretInput.inputValue();
    expect(widgetKey).toMatch(/^xsrag_pk_/);

    await page.locator('[data-testid="close-created-modal-btn"]').click();

    // 3. Web test: GET /embed/<key> response header Content-Security-Policy contains frame-ancestors https://site.example
    const embedRes = await request.get(`/embed/${widgetKey}`);
    expect(embedRes.status()).toBe(200);
    const csp = embedRes.headers()['content-security-policy'] || '';
    expect(csp).toContain('frame-ancestors');
    expect(csp).toContain('https://site.example');

    // 4. Web test: unknown key -> 404 page
    const unknownRes = await request.get('/embed/xsrag_pk_unknownkey12345678901234567890');
    expect(unknownRes.status()).toBe(404);

    await page.goto('/embed/xsrag_pk_unknownkey12345678901234567890');
    await expect(page.locator('h1:has-text("404")')).toBeVisible();
  });

  test('T-91 AC-91: /demo without login lists 5 documents and 4 example questions, answers with citation chip; after 10 questions shows DEMO_LIMIT; test page embedding widget.js shows launcher, click opens iframe chat', async ({
    browser,
  }) => {
    test.setTimeout(120000);
    // 1. First obtain a valid widget key for the embedding test
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();

    const timestamp = Date.now();
    const email = `admin_t91_${timestamp}@example.com`;
    const password = 'Password123!';

    await adminPage.goto('/register');
    await adminPage.fill('input[name="name"]', 'Admin T91');
    await adminPage.fill('input[name="email"]', email);
    await adminPage.fill('input[name="password"]', password);
    await adminPage.click('button[type="submit"]');
    await adminPage.waitForLoadState('networkidle');

    const wsInput = adminPage.locator('input[id="workspace-name"]');
    await wsInput.waitFor({ state: 'visible' });
    await wsInput.fill('Widget Host Workspace');
    await adminPage.click('button:has-text("Create Workspace")');
    await expect(adminPage).toHaveURL(/\/w\/([^/]+)\/admin\/settings/);

    const match = adminPage.url().match(/\/w\/([^/]+)/);
    const workspaceId = match ? match[1] : '';

    await adminPage.goto(`/w/${workspaceId}/admin/api-access`);
    await adminPage.waitForLoadState('networkidle');

    await adminPage.locator('[data-testid="create-key-btn"]').click();
    await adminPage.locator('[data-testid="key-name-input"]').fill('T91 Widget Key');
    await adminPage.locator('[data-testid="key-kind-select"]').selectOption('WIDGET');
    await adminPage.locator('[data-testid="allowed-origins-input"]').fill('http://localhost:3000');
    await adminPage.locator('[data-testid="submit-create-key-btn"]').click();

    const widgetSecretInput = adminPage.locator('[data-testid="key-secret"]');
    await expect(widgetSecretInput).toBeVisible({ timeout: 10000 });
    const widgetKey = await widgetSecretInput.inputValue();
    await adminContext.close();

    // 2. Fresh anonymous session without login
    const visitorContext = await browser.newContext();
    const page = await visitorContext.newPage();

    // A. Open /demo without login
    await page.goto('/demo');
    await page.waitForLoadState('networkidle');

    // Verify 5 sample documents are listed
    const docItems = page.locator('[data-testid="demo-document-item"]');
    await expect(docItems).toHaveCount(5, { timeout: 15000 });

    // Verify 4 example questions are listed
    const suggestedQuestions = page.locator('[data-testid="suggested-question"]');
    await expect(suggestedQuestions).toHaveCount(4);

    // B. Click example question "Can I work from another country?" -> answers with citation chip
    await suggestedQuestions.nth(1).click();

    // Answer should complete and show citation chip
    const citationChip = page.locator('[data-testid="citation-chip"]').first();
    await expect(citationChip).toBeVisible({ timeout: 20000 });

    // Open citation chip -> side panel opens with passage
    await citationChip.click();
    const citationPanel = page.locator('[data-testid="citation-panel"]');
    await expect(citationPanel).toBeVisible({ timeout: 10000 });
    await expect(citationPanel).toContainText('Source:');

    // Close citation panel
    await citationPanel.locator('button:has-text("Close"), button:has(svg.lucide-x)').first().click();

    // C. Ask remaining questions up to 10 questions, then 11th shows DEMO_LIMIT
    const chatInput = page.locator('[data-testid="chat-input"]');
    const sendBtn = page.locator('[data-testid="send-btn"]');

    // Ask questions 2 through 10
    for (let i = 2; i <= 10; i++) {
      await expect(sendBtn).toBeVisible({ timeout: 15000 });
      await chatInput.fill(`Follow-up demo question ${i}`);
      await sendBtn.click();
      // Wait for streaming to finish (send button becomes visible again)
      await expect(sendBtn).toBeVisible({ timeout: 20000 });
    }

    // Now send the 11th question -> should trigger 429 DEMO_LIMIT_REACHED and show LockedCopy.DEMO_LIMIT
    await chatInput.fill('Question 11 exceeding the demo limit');
    await sendBtn.click();

    // Verify DEMO_LIMIT message is displayed
    const limitMessage = page.locator('[data-testid="demo-limit-message"]');
    await expect(limitMessage).toBeVisible({ timeout: 15000 });
    await expect(limitMessage).toContainText(LockedCopy.DEMO_LIMIT);

    // D. Test page embedding widget.js shows launcher, click opens iframe chat
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Embed widget.js script with widgetKey
    await page.evaluate((key) => {
      const script = document.createElement('script');
      script.src = '/widget.js';
      script.setAttribute('data-key', key);
      document.body.appendChild(script);
    }, widgetKey);

    const launcher = page.locator('[data-testid="widget-launcher"]');
    await expect(launcher).toBeVisible({ timeout: 10000 });

    const iframe = page.locator('[data-testid="widget-iframe"]');
    await expect(iframe).toBeHidden();

    // Click launcher -> opens iframe chat
    await launcher.click();
    await expect(iframe).toBeVisible();
    await expect(iframe).toHaveAttribute('src', new RegExp(`/embed/${widgetKey}`));

    // Verify iframe contains widget chat
    const iframeChat = page.frameLocator('[data-testid="widget-iframe"]');
    await expect(iframeChat.locator('[data-testid="chat-input"]')).toBeVisible({ timeout: 15000 });

    await visitorContext.close();
  });
});
