import type { Page } from '@playwright/test';

/**
 * Shared e2e helpers (Phase 11, Slice 11.2).
 *
 * The journey must be deterministic and fully offline, so the model transports
 * are mocked at the network layer:
 *   - Ollama  : POST /api/chat            → NDJSON stream  (the default endpoint)
 *   - OpenAI  : POST /v1/chat/completions → SSE stream     (lmstudio / custom)
 *   - probes  : GET /api/tags, /v1/models → model lists    (boot endpoint probe)
 */

/** The chunks the mocked model "streams" back, and their concatenation. */
export const REPLY_CHUNKS = ['Acknowledged. ', 'Journey ', 'reply ', 'from ', 'mock.'];
export const REPLY_TEXT = REPLY_CHUNKS.join(''); // "Acknowledged. Journey reply from mock."

/** NDJSON body in Ollama's /api/chat streaming shape. */
function ollamaBody(model: string, chunks: string[]): string {
  return (
    chunks
      .map((c, i) =>
        JSON.stringify({
          model,
          message: { role: 'assistant', content: c },
          done: i === chunks.length - 1,
        }),
      )
      .join('\n') + '\n'
  );
}

/** SSE body in the OpenAI /v1/chat/completions streaming shape. */
function openaiBody(model: string, chunks: string[]): string {
  return (
    chunks
      .map((c) => 'data: ' + JSON.stringify({ model, choices: [{ delta: { content: c } }] }) + '\n\n')
      .join('') + 'data: [DONE]\n\n'
  );
}

/** Install deterministic, offline model-endpoint mocks for a page. */
export async function mockModelEndpoints(page: Page): Promise<void> {
  await page.route('**/api/tags', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ models: [{ name: 'llama3.1' }] }),
    }),
  );
  await page.route('**/v1/models', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [{ id: 'local-model' }] }),
    }),
  );
  await page.route('**/api/chat', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/x-ndjson',
      body: ollamaBody('llama3.1', REPLY_CHUNKS),
    }),
  );
  await page.route('**/v1/chat/completions', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: openaiBody('local-model', REPLY_CHUNKS),
    }),
  );
}

/**
 * Simulate a real file drop onto the left-pane Dropzone.
 *
 * The GraphRAG query input is a DOM descendant of the Dropzone's drop target,
 * so dispatching a `drop` carrying a populated DataTransfer there bubbles up to
 * React's delegated `onDrop` handler — the same path a user drag-and-drop takes.
 */
export async function dropTextFileOnGraph(
  page: Page,
  fileName: string,
  content: string,
): Promise<void> {
  const dataTransfer = await page.evaluateHandle(
    ({ fileName, content }) => {
      const dt = new DataTransfer();
      dt.items.add(new File([content], fileName, { type: 'text/plain' }));
      return dt;
    },
    { fileName, content },
  );
  await page.getByLabel('GraphRAG query').dispatchEvent('drop', { dataTransfer });
}

/** Execute a WebMCP tool through the app's real `document.modelContext` surface. */
export async function executeTool(
  page: Page,
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  await page.waitForFunction(
    () => !!(document as unknown as { modelContext?: unknown }).modelContext,
  );
  return page.evaluate(
    async ({ name, args }) => {
      const mc = (
        document as unknown as {
          modelContext: {
            executeTool: (
              n: string,
              a: Record<string, unknown>,
            ) => Promise<{ content: { type: 'text'; text: string }[] }>;
          };
        }
      ).modelContext;
      const res = await mc.executeTool(name, args);
      return res.content.map((c) => c.text).join('');
    },
    { name, args },
  );
}
