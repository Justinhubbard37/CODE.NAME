import { afterEach, describe, expect, it, vi } from 'vitest';
import { secretPresent, setSecret, deleteSecret } from './secrets';
import { invoke } from '@tauri-apps/api/core';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

const mockedInvoke = vi.mocked(invoke);

function enableTauri() {
  vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });
}

describe('secrets bridge', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('checks presence without reading raw secret values', async () => {
    enableTauri();
    mockedInvoke.mockResolvedValueOnce(true);

    await expect(secretPresent('GEMINI_API_KEY')).resolves.toBe(true);

    expect(mockedInvoke).toHaveBeenCalledWith('secret_present', { name: 'GEMINI_API_KEY' });
    expect(mockedInvoke).not.toHaveBeenCalledWith('secret_get', expect.anything());
  });

  it('does not expose raw values from presence checks', async () => {
    enableTauri();
    mockedInvoke.mockResolvedValueOnce('sk-raw-secret-value');

    await expect(secretPresent('GEMINI_API_KEY')).resolves.toBe(false);
    expect(mockedInvoke).toHaveBeenCalledWith('secret_present', { name: 'GEMINI_API_KEY' });
  });

  it('keeps set and delete as lifecycle operations only', async () => {
    enableTauri();
    mockedInvoke.mockResolvedValue(undefined);

    await expect(setSecret('OLLAMA_API_KEY', 'sk-test')).resolves.toBe(true);
    await expect(deleteSecret('OLLAMA_API_KEY')).resolves.toBeUndefined();

    expect(mockedInvoke).toHaveBeenCalledWith('secret_set', {
      name: 'OLLAMA_API_KEY',
      value: 'sk-test',
    });
    expect(mockedInvoke).toHaveBeenCalledWith('secret_delete', { name: 'OLLAMA_API_KEY' });
  });
});
