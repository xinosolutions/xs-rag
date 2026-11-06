import { test, expect } from '@playwright/test';
import { LockedCopy } from '@xs-rag/shared';
import { clearMailbox, waitForEmail } from './helpers/mailpit';

test.describe('Phase 11: Web Foundation (T-80..T-83)', () => {
  test.beforeEach(async () => {
    await clearMailbox();
  });

  test('T-80 AC-80: register, login, logout, forgot-password, reset-password, next param', async ({
    page,
  }) => {
    const timestamp = Date.now();
    const email = `user_${timestamp}@example.com`;
    const password = 'Password123!';
    const newPassword = 'NewPassword456!';

    // 1. Register -> lands in /w
    await page.goto('/register');
    await page.fill('input[name="name"]', 'Test User');
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', password);
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/\/w$/);
    await page.waitForLoadState('networkidle');

    // 2. Logout -> lands in /login
    await page.click('button:has-text("Log out")');
    await expect(page).toHaveURL(/\/login/);
    await page.waitForLoadState('networkidle');

    // 3. Wrong password shows LOGIN_FAILED
    const emailInput = page.locator('input[name="email"]');
    await emailInput.waitFor({ state: 'visible' });
    await emailInput.fill(email);
    await page.fill('input[name="password"]', 'WrongPassword999!');
    await page.click('button[type="submit"]');

    const errorAlert = page.locator('[data-testid="error-alert"]');
    await expect(errorAlert).toBeVisible();
    await expect(errorAlert).toContainText(LockedCopy.LOGIN_FAILED);

    // 4. Forgot password shows RESET_SENT
    await page.goto('/forgot-password');
    await page.waitForLoadState('networkidle');
    await page.fill('input[name="email"]', email);
    await page.click('button[type="submit"]');

    const statusAlert = page.locator('[data-testid="status-alert"]');
    await expect(statusAlert).toBeVisible();
    await expect(statusAlert).toContainText(LockedCopy.RESET_SENT);

    // 5. Reset link from mail sink sets password
    const resetMail = await waitForEmail(email);
    expect(resetMail.link).toBeDefined();

    await page.goto(resetMail.link!);
    await page.waitForLoadState('networkidle');
    await page.fill('input[name="password"]', newPassword);
    await page.click('button[type="submit"]');

    await expect(page.locator('text=Password has been reset successfully.')).toBeVisible();

    // 6. Login honors ?next=
    await page.goto('/login?next=/w');
    await page.waitForLoadState('networkidle');
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', newPassword);
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/\/w$/);
  });

  test('T-81 AC-81: signed-out redirect and member access to admin pages', async ({
    browser,
  }) => {
    // 1. Signed-out visitor to /w/x/admin/documents redirects to /login?next=...
    const visitorContext = await browser.newContext();
    const visitorPage = await visitorContext.newPage();

    await visitorPage.goto('/w/some-workspace-id/admin/documents');
    await expect(visitorPage).toHaveURL(/\/login\?next=(%2F|\/)w(%2F|\/)some-workspace-id(%2F|\/)admin(%2F|\/)documents/);
    await visitorContext.close();

    // 2. Setup an admin and a member in a workspace
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();

    const timestamp = Date.now();
    const adminEmail = `admin_${timestamp}@example.com`;
    const memberEmail = `member_${timestamp}@example.com`;
    const password = 'Password123!';

    // Admin registers and creates workspace
    await adminPage.goto('/register');
    await adminPage.fill('input[name="name"]', 'Admin User');
    await adminPage.fill('input[name="email"]', adminEmail);
    await adminPage.fill('input[name="password"]', password);
    await adminPage.click('button[type="submit"]');
    await expect(adminPage).toHaveURL(/\/w$/);
    await adminPage.waitForLoadState('networkidle');

    const wsInput = adminPage.locator('input[id="workspace-name"]');
    await wsInput.waitFor({ state: 'visible' });
    await wsInput.fill('Guarded Workspace');
    await adminPage.click('button:has-text("Create Workspace")');
    await expect(adminPage).toHaveURL(/\/w\/([^/]+)\/admin\/settings/);

    const match = adminPage.url().match(/\/w\/([^/]+)/);
    const workspaceId = match ? match[1] : '';
    expect(workspaceId).toBeTruthy();

    // Admin invites member
    await adminPage.goto(`/w/${workspaceId}/admin/members`);
    await adminPage.waitForLoadState('networkidle');
    await adminPage.fill('input[name="email"]', memberEmail);
    await adminPage.click('button:has-text("Invite")');

    const inviteMail = await waitForEmail(memberEmail);
    expect(inviteMail.link).toBeDefined();

    // Member registers and accepts invitation
    const memberContext = await browser.newContext();
    const memberPage = await memberContext.newPage();

    await memberPage.goto('/register');
    await memberPage.fill('input[name="name"]', 'Member User');
    await memberPage.fill('input[name="email"]', memberEmail);
    await memberPage.fill('input[name="password"]', password);
    await memberPage.click('button[type="submit"]');
    await expect(memberPage).toHaveURL(/\/w$/);
    await memberPage.waitForLoadState('networkidle');

    await memberPage.goto(inviteMail.link!);
    await memberPage.click('button:has-text("Accept Invitation")');
    await expect(memberPage).toHaveURL(new RegExp(`/w/${workspaceId}`));

    // Member visiting admin URL sees NOT_ALLOWED
    await memberPage.goto(`/w/${workspaceId}/admin/documents`);
    await expect(memberPage.locator(`text=${LockedCopy.NOT_ALLOWED}`)).toBeVisible();

    await memberPage.goto(`/w/${workspaceId}/admin/settings`);
    await expect(memberPage.locator(`text=${LockedCopy.NOT_ALLOWED}`)).toBeVisible();

    // Member sidebar has no admin links
    await memberPage.goto(`/w/${workspaceId}/chat`);
    await expect(memberPage.locator('nav a:has-text("Chat")')).toBeVisible();
    await expect(memberPage.locator('nav a:has-text("Documents")')).not.toBeVisible();
    await expect(memberPage.locator('nav a:has-text("Members")')).not.toBeVisible();
    await expect(memberPage.locator('nav a:has-text("Settings")')).not.toBeVisible();
    await expect(memberPage.locator('nav a:has-text("Evaluation")')).not.toBeVisible();

    await adminContext.close();
    await memberContext.close();
  });

  test('T-82 AC-82: workspace picker, invite, accept, role change, remove, last admin error', async ({
    browser,
  }) => {
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();

    const timestamp = Date.now();
    const adminEmail = `admin_t82_${timestamp}@example.com`;
    const memberEmail = `member_t82_${timestamp}@example.com`;
    const password = 'Password123!';

    // Register admin
    await adminPage.goto('/register');
    await adminPage.fill('input[name="name"]', 'Admin T82');
    await adminPage.fill('input[name="email"]', adminEmail);
    await adminPage.fill('input[name="password"]', password);
    await adminPage.click('button[type="submit"]');
    await expect(adminPage).toHaveURL(/\/w$/);
    await adminPage.waitForLoadState('networkidle');

    // Create workspace
    const wsInput = adminPage.locator('input[id="workspace-name"]');
    await wsInput.waitFor({ state: 'visible' });
    await wsInput.fill('Acme Operations');
    await adminPage.click('button:has-text("Create Workspace")');
    await expect(adminPage).toHaveURL(/\/w\/([^/]+)\/admin\/settings/);

    const match = adminPage.url().match(/\/w\/([^/]+)/);
    const workspaceId = match ? match[1] : '';

    // Go to members page and invite member
    await adminPage.goto(`/w/${workspaceId}/admin/members`);
    await adminPage.waitForLoadState('networkidle');
    await adminPage.fill('input[name="email"]', memberEmail);
    await adminPage.selectOption('select[name="role"]', 'MEMBER');
    await adminPage.click('button:has-text("Invite")');

    // Copy link from mail sink
    const inviteMail = await waitForEmail(memberEmail);
    expect(inviteMail.link).toBeDefined();

    // Member signs in and accepts
    const memberContext = await browser.newContext();
    const memberPage = await memberContext.newPage();

    await memberPage.goto('/register');
    await memberPage.fill('input[name="name"]', 'Member T82');
    await memberPage.fill('input[name="email"]', memberEmail);
    await memberPage.fill('input[name="password"]', password);
    await memberPage.click('button[type="submit"]');
    await expect(memberPage).toHaveURL(/\/w$/);
    await memberPage.waitForLoadState('networkidle');

    await memberPage.goto(inviteMail.link!);
    await expect(memberPage.locator('text=Acme Operations').first()).toBeVisible();
    await memberPage.click('button:has-text("Accept Invitation")');
    await expect(memberPage).toHaveURL(new RegExp(`/w/${workspaceId}`));

    // Admin reloads members page: change role then remove
    await adminPage.reload();
    await adminPage.waitForLoadState('networkidle');
    const memberRow = adminPage.locator(`tr:has-text("${memberEmail}")`);
    await expect(memberRow).toBeVisible();

    // Change role to ADMIN
    await memberRow.locator('select').selectOption('ADMIN');
    await expect(adminPage.locator('text=Member role updated.')).toBeVisible();

    // Remove member
    await memberRow.locator('button:has-text("Remove")').click();
    await expect(adminPage.locator('text=Member removed.')).toBeVisible();
    await expect(adminPage.locator(`tr:has-text("${memberEmail}")`)).not.toBeVisible();

    // Last-admin attempt: Admin attempts to demote self
    const adminRow = adminPage.locator(`tr:has-text("${adminEmail}")`);
    await adminRow.locator('select').selectOption('MEMBER');

    // Assert API error text shown
    const errorAlert = adminPage.locator('[data-testid="error-alert"]');
    await expect(errorAlert).toBeVisible();
    await expect(errorAlert).toContainText('Cannot demote the only admin');

    await adminContext.close();
    await memberContext.close();
  });

  test('T-83 AC-83: settings page renames workspace and selects AI model', async ({
    page,
  }) => {
    const timestamp = Date.now();
    const email = `settings_${timestamp}@example.com`;
    const password = 'Password123!';

    // Register admin
    await page.goto('/register');
    await page.fill('input[name="name"]', 'Settings Admin');
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', password);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/w$/);
    await page.waitForLoadState('networkidle');

    // Create workspace
    const wsInput = page.locator('input[id="workspace-name"]');
    await wsInput.waitFor({ state: 'visible' });
    await wsInput.fill('Initial Name');
    await page.click('button:has-text("Create Workspace")');
    await expect(page).toHaveURL(/\/w\/([^/]+)\/admin\/settings/);

    const match = page.url().match(/\/w\/([^/]+)/);
    const workspaceId = match ? match[1] : '';

    // Rename workspace
    await page.waitForLoadState('networkidle');
    await page.fill('input[id="workspace-name"]', 'Acme Renamed');
    await page.click('button:has-text("Save Workspace Name")');
    await expect(page.locator('text=Workspace renamed successfully.')).toBeVisible();

    // Pick fake-model
    await page.selectOption('select[id="ai-model"]', 'fake-model');
    await page.click('button:has-text("Save Model")');
    await expect(page.locator('text=AI model updated successfully.')).toBeVisible();

    // Reload shows both persisted
    await page.reload();
    await page.waitForLoadState('networkidle');

    await expect(page.locator('input[id="workspace-name"]')).toHaveValue('Acme Renamed');
    await expect(page.locator('select[id="ai-model"]')).toHaveValue('fake-model');
  });
});
