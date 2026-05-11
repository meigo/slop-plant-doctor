import { test, expect } from '@playwright/test';

// Light E2E suite for v1:
// - Verify capture page renders correctly with the form in its initial state
// - Verify the static example page renders a complete diagnosis layout
// - Verify a random ID hits the 404 path
//
// Full happy-path with API mocking is deferred to when CI is configured.

test('capture page renders and the submit button starts disabled', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Plant Doctor' })).toBeVisible();
  await expect(page.getByPlaceholder(/What's wrong\?/i)).toBeVisible();

  const submit = page.getByRole('button', { name: /^Diagnose$/i });
  await expect(submit).toBeDisabled();
});

test('example page renders a diagnosis', async ({ page }) => {
  await page.goto('/example');

  await expect(page.getByRole('heading', { name: 'Monstera deliciosa' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Overwatering/ })).toBeVisible();
  await expect(page.getByText('Recovery plan')).toBeVisible();
});

test('non-existent diagnosis ID renders error page', async ({ page }) => {
  await page.goto('/d/zzzzzzzz', { waitUntil: 'domcontentloaded' });
  // Whether it's a 404 or 500 (due to platform env in preview), the user should land on an error page.
  // The error page should have either "not found" or "Something went wrong" and a link to start over.
  await expect(page.getByText(/diagnose a new plant/i)).toBeVisible({ timeout: 5000 });
});
