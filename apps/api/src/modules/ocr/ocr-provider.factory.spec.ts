import { resolveOcrProvider, type OcrProviderSettings } from './ocr-provider.factory';

const base: OcrProviderSettings = {
  provider: 'google',
  isProduction: false,
  mockLatencyMs: 0,
  mockSeed: 'test',
  claudeModel: 'claude-opus-5',
  claudeMaxTokens: 8000,
};

describe('resolveOcrProvider', () => {
  it('uses Google Vision when a key file is configured', () => {
    const result = resolveOcrProvider({ ...base, googleKeyFile: '/key.json' });
    expect(result).toEqual({ effective: 'google', requested: 'google' });
  });

  it('uses Google Vision with application default credentials', () => {
    const result = resolveOcrProvider({ ...base, googleApplicationCredentials: '/adc.json' });
    expect(result.effective).toBe('google');
  });

  it('falls back to the mock when Google credentials are missing', () => {
    const result = resolveOcrProvider(base);
    expect(result.effective).toBe('mock');
    expect(result.requested).toBe('google');
    // The reason is what the operator sees in the startup banner.
    expect(result.reason).toMatch(/GOOGLE_VISION_KEY_FILE/);
  });

  it('uses Claude when its key is configured', () => {
    const result = resolveOcrProvider({
      ...base,
      provider: 'claude',
      anthropicApiKey: 'sk-ant-test',
    });
    expect(result.effective).toBe('claude');
  });

  it('falls back to the mock when the Claude key is missing', () => {
    const result = resolveOcrProvider({ ...base, provider: 'claude' });
    expect(result.effective).toBe('mock');
    expect(result.reason).toMatch(/ANTHROPIC_API_KEY/);
  });

  it('reports no reason when the mock was chosen deliberately', () => {
    const result = resolveOcrProvider({ ...base, provider: 'mock' });
    expect(result).toEqual({ effective: 'mock', requested: 'mock' });
    expect(result.reason).toBeUndefined();
  });

  it('always states which provider was requested, even after a fallback', () => {
    expect(resolveOcrProvider(base).requested).toBe('google');
    expect(resolveOcrProvider({ ...base, provider: 'claude' }).requested).toBe('claude');
  });
});
