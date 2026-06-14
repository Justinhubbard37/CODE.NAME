import { describe, it, expect, vi, afterEach } from 'vitest';
import { streamA2A, type SidecarInfo } from './sidecar';

const info: SidecarInfo = { status: 'ready', host: '127.0.0.1', port: 5000, token: 'tok' };

/** Build a fake SSE response body from a list of raw frame strings. */
function sseResponse(frames: string[]): Response {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const f of frames) controller.enqueue(enc.encode(f));
      controller.close();
    },
  });
  return { ok: true, body } as unknown as Response;
}

function msg(text: string): string {
  return 'data: ' + JSON.stringify({ result: { kind: 'message', parts: [{ text }] } }) + '\n\n';
}

describe('streamA2A (A2A SSE parser)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('concatenates the text of A2A message events in order', async () => {
    const frames = [
      msg('Hello'),
      msg(', world'),
      'data: ' +
        JSON.stringify({ result: { kind: 'status-update', status: { state: 'completed' }, final: true } }) +
        '\n\n',
    ];
    globalThis.fetch = vi.fn().mockResolvedValue(sseResponse(frames)) as unknown as typeof fetch;

    const tokens: string[] = [];
    const full = await streamA2A(info, 'hi', { onToken: (t) => tokens.push(t) });

    expect(full).toBe('Hello, world');
    expect(tokens.join('')).toBe('Hello, world');
  });

  it('ignores non-message frames (status updates contribute no text)', async () => {
    const frames = [
      'data: ' + JSON.stringify({ result: { kind: 'status-update', status: {} } }) + '\n\n',
      msg('X'),
    ];
    globalThis.fetch = vi.fn().mockResolvedValue(sseResponse(frames)) as unknown as typeof fetch;

    const full = await streamA2A(info, 'q', { onToken: () => {} });
    expect(full).toBe('X');
  });

  it('throws on a non-OK HTTP response', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 401, body: null } as unknown as Response) as unknown as typeof fetch;

    await expect(streamA2A(info, 'q', { onToken: () => {} })).rejects.toThrow(/401/);
  });
});
