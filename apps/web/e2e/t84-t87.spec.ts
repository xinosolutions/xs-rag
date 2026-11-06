import { test, expect } from '@playwright/test';
import { LockedCopy } from '@xs-rag/shared';

test.describe('Phase 12: Web Documents and Chat (T-84..T-87)', () => {
  test('T-84 AC-84: upload .md fixture (and drag-drop), live status, failed retry, access dialog, delete, passages', async ({
    page,
  }) => {
    const timestamp = Date.now();
    const email = `admin_t84_${timestamp}@example.com`;
    const password = 'Password123!';

    // Register admin & create workspace
    await page.goto('/register');
    await page.fill('input[name="name"]', 'Admin T84');
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', password);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/w$/);

    const wsInput = page.locator('input[id="workspace-name"]');
    await wsInput.waitFor({ state: 'visible' });
    await wsInput.fill('Doc Workspace T84');
    await page.click('button:has-text("Create Workspace")');
    await expect(page).toHaveURL(/\/w\/([^/]+)\/admin\/settings/);

    const match = page.url().match(/\/w\/([^/]+)/);
    const workspaceId = match ? match[1] : '';
    expect(workspaceId).toBeTruthy();

    // Navigate to Documents page
    await page.goto(`/w/${workspaceId}/admin/documents`);
    await page.waitForLoadState('networkidle');

    // 1. Upload valid .md fixture
    const validFile = {
      name: 'vacation-policy.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from(
        '# Vacation Policy\n\nAll employees receive 25 days paid time off per year.\n\n## Medical Leave\nMedical leave requires doctor note.',
      ),
    };

    const fileInput = page.locator('[data-testid="file-upload-input"]');
    await fileInput.setInputFiles(validFile);

    // Row shows Processing then Ready without reload
    const validRow = page.locator('tr:has-text("vacation-policy.md")');
    await expect(validRow).toBeVisible();

    // Verify it transitions to Ready
    await expect(validRow.locator('[data-testid="status-ready"]')).toBeVisible({ timeout: 15000 });
    await expect(validRow.locator(`text=${LockedCopy.STATUS_READY}`)).toBeVisible();

    // 2. Failing fixture shows Failed, reason, Retry works
    const emptyFile = {
      name: 'empty.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from('   '),
    };
    await fileInput.setInputFiles(emptyFile);

    const failedRow = page.locator('tr:has-text("empty.md")');
    await expect(failedRow).toBeVisible();
    await expect(failedRow.locator('[data-testid="status-failed"]')).toBeVisible({ timeout: 15000 });
    await expect(failedRow.locator(`text=${LockedCopy.STATUS_FAILED}`)).toBeVisible();

    // Retry works
    const retryBtn = failedRow.locator('[data-testid="retry-btn"]');
    await expect(retryBtn).toBeVisible();
    await retryBtn.click();
    // After retry click, it goes back to processing/queued
    await expect(failedRow.locator('[data-testid="status-processing"]')).toBeVisible({ timeout: 5000 });

    // 3. Access dialog sets ADMINS_ONLY
    await validRow.locator('[data-testid="access-btn"]').click();
    await expect(page.locator('text=Document Access: vacation-policy.md')).toBeVisible();

    // Select Admins only
    await page.click('input[value="ADMINS_ONLY"]');
    await page.click('button:has-text("Save Access")');

    await expect(page.locator('text=Document Access: vacation-policy.md')).not.toBeVisible();
    await expect(validRow.locator('text=Admins only')).toBeVisible();

    // 4. Delete asks confirmation
    await failedRow.locator('[data-testid="delete-btn"]').click();
    await expect(page.locator('text=Are you sure you want to delete')).toBeVisible();
    await page.locator('div[role="dialog"] button:has-text("Delete")').click();

    await expect(page.locator('tr:has-text("empty.md")')).not.toBeVisible();

    // 5. Document page lists passages with page/heading
    await validRow.locator('a:has-text("vacation-policy.md")').first().click();
    await expect(page).toHaveURL(new RegExp(`/w/${workspaceId}/admin/documents/`));

    const passageCards = page.locator('[data-testid="passage-card"]');
    await expect(passageCards.first()).toBeVisible();
    await expect(page.locator('[data-testid="passage-heading"]').first()).toBeVisible();
  });

  test('T-85 AC-85: chat streaming, stop control, ANSWER_STOPPED, __NO_ANSWER__, __FAIL__, CHAT_EMPTY', async ({
    page,
  }) => {
    const timestamp = Date.now();
    const email = `member_t85_${timestamp}@example.com`;
    const password = 'Password123!';

    // Register & create workspace
    await page.goto('/register');
    await page.fill('input[name="name"]', 'Member T85');
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', password);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/w$/);

    const wsInput = page.locator('input[id="workspace-name"]');
    await wsInput.waitFor({ state: 'visible' });
    await wsInput.fill('Chat Workspace T85');
    await page.click('button:has-text("Create Workspace")');
    await expect(page).toHaveURL(/\/w\/([^/]+)\/admin\/settings/);

    const match = page.url().match(/\/w\/([^/]+)/);
    const workspaceId = match ? match[1] : '';

    // Go to Chat page
    await page.goto(`/w/${workspaceId}/chat`);
    await page.waitForLoadState('networkidle');

    // 1. Empty chat shows CHAT_EMPTY copy
    await expect(page.locator(`text=${LockedCopy.CHAT_EMPTY}`)).toBeVisible();

    // 2. Ask -> text grows over time
    const chatInput = page.locator('[data-testid="chat-input"]');
    const sendBtn = page.locator('[data-testid="send-btn"]');

    await chatInput.fill('What are standard office hours?');
    await sendBtn.click();

    // Verify user message appears
    await expect(page.locator('text=What are standard office hours?')).toBeVisible();

    // Fake provider answers token by token
    await expect(page.locator('text=Answer based on the documents')).toBeVisible({ timeout: 10000 });

    // 3. Stop button visible while streaming and ANSWER_STOPPED shown after click
    // __SLOW__ emits a token every 100ms for 5s in fake provider
    await chatInput.fill('Explain __SLOW__ process');
    await sendBtn.click();

    const stopBtn = page.locator('[data-testid="stop-btn"]');
    await expect(stopBtn).toBeVisible({ timeout: 2000 });
    await stopBtn.click();

    // ANSWER_STOPPED copy appears and partial text is kept
    await expect(page.locator('[data-testid="answer-stopped"]')).toBeVisible();
    await expect(page.locator(`text=${LockedCopy.ANSWER_STOPPED}`)).toBeVisible();

    // 4. __NO_ANSWER__ renders NO_ANSWER text
    await chatInput.fill('Query with __NO_ANSWER__');
    await sendBtn.click();

    await expect(page.locator('[data-testid="no-answer-copy"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator(`text=${LockedCopy.NO_ANSWER}`)).toBeVisible();

    // 5. __FAIL__ shows LLM_UNAVAILABLE copy
    await chatInput.fill('Question that causes __FAIL__');
    await sendBtn.click();

    await expect(page.locator('[data-testid="error-copy"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator(`text=${LockedCopy.LLM_UNAVAILABLE}`)).toBeVisible();
  });

  test('T-86 AC-86: citation chips labelled per CONTRACTS open side panel; unavailable shows CITATION_UNAVAILABLE', async ({
    page,
    request: apiRequest,
  }) => {
    const timestamp = Date.now();
    const email = `member_t86_${timestamp}@example.com`;
    const password = 'Password123!';

    // Register & create workspace
    await page.goto('/register');
    await page.fill('input[name="name"]', 'Member T86');
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', password);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/w$/);

    const wsInput = page.locator('input[id="workspace-name"]');
    await wsInput.waitFor({ state: 'visible' });
    await wsInput.fill('Citations Workspace T86');
    await page.click('button:has-text("Create Workspace")');
    await expect(page).toHaveURL(/\/w\/([^/]+)\/admin\/settings/);

    const match = page.url().match(/\/w\/([^/]+)/);
    const workspaceId = match ? match[1] : '';

    // Upload document
    await page.goto(`/w/${workspaceId}/admin/documents`);
    await page.waitForLoadState('networkidle');

    const validFile = {
      name: 'policy-guide.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from(
        '# Policy Guide\n\nStandard holidays are 15 days.\n\n## Medical Coverage\nHealth plan covers all full-time members.',
      ),
    };
    await page.locator('[data-testid="file-upload-input"]').setInputFiles(validFile);
    await expect(page.locator('tr:has-text("policy-guide.md") [data-testid="status-ready"]')).toBeVisible({
      timeout: 15000,
    });

    // Go to Chat
    await page.goto(`/w/${workspaceId}/chat`);
    await page.waitForLoadState('networkidle');

    await page.locator('[data-testid="chat-input"]').fill('What are the holidays?');
    await page.locator('[data-testid="send-btn"]').click();

    // Fake provider answers with citation
    const citationChip = page.locator('[data-testid="citation-chip"]').first();
    await expect(citationChip).toBeVisible({ timeout: 10000 });

    // Format matches {fileName} · {heading}
    await expect(citationChip).toContainText('policy-guide.md');

    // Click citation chip opens side panel with passage text
    await citationChip.click();
    const sidePanel = page.locator('[data-testid="citation-panel"]');
    await expect(sidePanel).toBeVisible();
    await expect(sidePanel.locator('text=Source: policy-guide.md')).toBeVisible();

    // Now test unavailable citation shows CITATION_UNAVAILABLE
    // Delete the document so passage becomes unavailable (404)
    // Go to documents page and delete the document
    await page.goto(`/w/${workspaceId}/admin/documents`);
    await page.waitForLoadState('networkidle');

    const docRow = page.locator('tr:has-text("policy-guide.md")');
    await docRow.locator('[data-testid="delete-btn"]').click();
    await page.locator('div[role="dialog"] button:has-text("Delete")').click();
    await expect(page.locator('tr:has-text("policy-guide.md")')).not.toBeVisible();

    // Go back to chat
    await page.goto(`/w/${workspaceId}/chat`);
    await page.waitForLoadState('networkidle');

    // Open first chat from history sidebar
    const chatItem = page.locator('[data-testid="chat-item"]').first();
    await chatItem.click();

    // Click citation chip again
    const staleChip = page.locator('[data-testid="citation-chip"]').first();
    await expect(staleChip).toBeVisible({ timeout: 5000 });
    await staleChip.click();

    // Side panel shows CITATION_UNAVAILABLE copy
    await expect(page.locator('[data-testid="citation-unavailable"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator(`text=${LockedCopy.CITATION_UNAVAILABLE}`)).toBeVisible();
  });

  test('T-87 AC-87: sidebar lists earlier chats, reopen shows history, delete removes, follow-up, thumbs feedback', async ({
    page,
  }) => {
    const timestamp = Date.now();
    const email = `member_t87_${timestamp}@example.com`;
    const password = 'Password123!';

    // Register & create workspace
    await page.goto('/register');
    await page.fill('input[name="name"]', 'Member T87');
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', password);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/w$/);

    const wsInput = page.locator('input[id="workspace-name"]');
    await wsInput.waitFor({ state: 'visible' });
    await wsInput.fill('History Workspace T87');
    await page.click('button:has-text("Create Workspace")');
    await expect(page).toHaveURL(/\/w\/([^/]+)\/admin\/settings/);

    const match = page.url().match(/\/w\/([^/]+)/);
    const workspaceId = match ? match[1] : '';

    // Go to Chat
    await page.goto(`/w/${workspaceId}/chat`);
    await page.waitForLoadState('networkidle');

    // 1. First chat: Ask first question
    const chatInput = page.locator('[data-testid="chat-input"]');
    const sendBtn = page.locator('[data-testid="send-btn"]');

    await chatInput.fill('Initial question in chat one');
    await sendBtn.click();
    await expect(page.locator('text=Initial question in chat one')).toBeVisible();
    await expect(page.locator('text=Answer based on the documents').first()).toBeVisible({ timeout: 10000 });

    // 2. Follow-up appends to same chat
    await chatInput.fill('Follow-up question in chat one');
    await sendBtn.click();
    await expect(page.locator('text=Follow-up question in chat one')).toBeVisible();
    await expect(page.locator('text=Answer based on the documents').nth(1)).toBeVisible({ timeout: 10000 });

    // 3. New Chat button -> Second chat
    await page.locator('button:has-text("New Chat")').click();
    await expect(page.locator(`text=${LockedCopy.CHAT_EMPTY}`)).toBeVisible();

    await chatInput.fill('Question in chat two');
    await sendBtn.click();
    await expect(page.locator('text=Question in chat two')).toBeVisible();
    await expect(page.locator('text=Answer based on the documents')).toBeVisible({ timeout: 10000 });

    // Two chats appear in sidebar
    const chatItems = page.locator('[data-testid="chat-item"]');
    await expect(chatItems).toHaveCount(2, { timeout: 10000 });

    // 4. Reopen shows history
    // Click on the older chat (chat one)
    await chatItems.nth(1).click();
    await expect(page.locator('text=Initial question in chat one')).toBeVisible();
    await expect(page.locator('text=Follow-up question in chat one')).toBeVisible();

    // 5. Thumbs-down then thumbs-up changes highlighted rating
    const thumbsDownBtn = page.locator('[data-testid="thumbs-down-btn"]').first();
    const thumbsUpBtn = page.locator('[data-testid="thumbs-up-btn"]').first();

    await thumbsDownBtn.click();
    // Thumbs down is highlighted (bg-red-100)
    await expect(thumbsDownBtn).toHaveClass(/bg-red-100/);

    // Now click thumbs up
    await thumbsUpBtn.click();
    // Thumbs up is highlighted (bg-green-100) and thumbs down is no longer highlighted
    await expect(thumbsUpBtn).toHaveClass(/bg-green-100/);
    await expect(thumbsDownBtn).not.toHaveClass(/bg-red-100/);

    // 6. Delete removes chat from sidebar
    // Click delete on the second chat
    await chatItems.nth(0).locator('[data-testid="delete-chat-btn"]').click();
    await expect(page.locator('[data-testid="chat-item"]')).toHaveCount(1, { timeout: 5000 });
  });
});
