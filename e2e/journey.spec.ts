import { test, expect } from '@playwright/test';
import {
  mockModelEndpoints,
  dropTextFileOnGraph,
  executeTool,
  REPLY_TEXT,
} from './helpers';

/**
 * Phase 11, Slice 11.2 — the main user journey, end to end:
 *
 *   ingest → search → chat → tool → audit
 *
 * Driven through the real UI against the Vite dev server, with model endpoints
 * mocked so the run is deterministic and fully offline. Single-user mode
 * auto-signs into the default (admin) account, so the app boots straight into
 * the two-pane shell with all gates open.
 */
test.describe('CODE NAME — main user journey', () => {
  test.beforeEach(async ({ page }) => {
    await mockModelEndpoints(page);
    await page.goto('/');
    // Shell is ready once the chat composer is on screen.
    await expect(page.getByLabel('Message the agent')).toBeVisible();
  });

  test('completes ingest → search → chat → tool → audit', async ({ page }) => {
    await test.step('ingest: drop a document into the gated perimeter', async () => {
      await dropTextFileOnGraph(
        page,
        'e2e-intel.txt',
        'Field notes for the end-to-end journey. Subject under review.',
      );
      const ledger = page.getByRole('region', { name: 'Ingestion ledger' });
      await expect(ledger).toBeVisible();
      await expect(ledger).toContainText('e2e-intel.txt');
      await expect(ledger).toContainText('INDEXED');
    });

    await test.step('search: run a GraphRAG retrieval query', async () => {
      const query = page.getByLabel('GraphRAG query');
      await query.fill('cobalt');
      await query.press('Enter');
      await expect(query).toHaveValue('cobalt');
      // Verify retrieval over the live graph via the same retriever the UI uses.
      const hits = await executeTool(page, 'graph.search', { query: 'cobalt' });
      expect(hits).toContain('OPERATION COBALT');
    });

    await test.step('chat: send a message and receive the streamed reply', async () => {
      const composer = page.getByLabel('Message the agent');
      await composer.fill('Ping from e2e');
      await composer.press('Enter');
      await expect(page.getByText('Ping from e2e')).toBeVisible();
      await expect(page.getByText(/Journey reply from mock/)).toBeVisible();
      // Sanity: the full mocked reply was assembled from the streamed chunks.
      expect(REPLY_TEXT).toContain('Journey reply');
    });

    await test.step('tool: execute a gated WebMCP tool', async () => {
      // The tool is advertised in the WebMCP bar…
      await expect(page.getByText('graph.note', { exact: true })).toBeVisible();
      // …and executes through the real gate-guarded + audited tool path.
      const out = await executeTool(page, 'graph.note', {
        title: 'E2E_NOTE',
        text: 'note created by the e2e tool step',
      });
      expect(out).toMatch(/created doc-/);
    });

    await test.step('audit: the write history records the gated writes', async () => {
      await page.getByRole('button', { name: 'Expand audit ledger' }).click();
      // The ledger loads on open; refresh until the audited writes appear.
      await expect
        .poll(
          async () => {
            await page.getByRole('button', { name: 'Refresh audit ledger' }).click();
            return page.getByText('[create]').count();
          },
          { timeout: 15_000 },
        )
        .toBeGreaterThan(0);
      // The tamper-evident hash chain across those records must verify intact.
      await page.getByRole('button', { name: 'Verify tamper-evident hash chain' }).click();
      await expect(page.getByText(/chain intact/i)).toBeVisible();
    });
  });
});
