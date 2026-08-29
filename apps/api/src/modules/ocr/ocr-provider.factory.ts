import { Logger } from '@nestjs/common';

import type { OcrProvider } from '@cheque-flow/shared-types';

import { ClaudeVisionOcrProvider } from './providers/claude-vision-ocr.provider';
import { GoogleVisionOcrProvider } from './providers/google-vision-ocr.provider';
import { MockOcrProvider } from './providers/mock-ocr.provider';

export type OcrProviderName = 'mock' | 'claude' | 'google';

export interface OcrProviderSettings {
  provider: OcrProviderName;
  isProduction: boolean;
  mockLatencyMs: number;
  mockSeed: string;
  anthropicApiKey?: string | undefined;
  claudeModel: string;
  claudeMaxTokens: number;
  googleKeyFile?: string | undefined;
  /** Set when the Google SDK can pick credentials up from the environment. */
  googleApplicationCredentials?: string | undefined;
}

export interface OcrProviderResolution {
  /** The provider that will actually run. */
  effective: OcrProviderName;
  /** What configuration asked for, which may differ from `effective`. */
  requested: OcrProviderName;
  /** Populated when the requested provider could not be used. */
  reason?: string;
}

/**
 * Decides which OCR provider can actually run.
 *
 * The default is Google Vision — the free option — so a fresh install gets
 * real text recognition without a paid account. When its credentials are
 * missing the behaviour depends on the environment:
 *
 *  - **production**: never reached. `env.schema.ts` refuses to start, because
 *    silently serving synthetic data in a financial system is worse than
 *    failing to boot.
 *  - **development / test**: falls back to the mock provider so a clone, the
 *    test suites and CI all run with no cloud account — and says so loudly.
 */
export function resolveOcrProvider(settings: OcrProviderSettings): OcrProviderResolution {
  const requested = settings.provider;

  if (requested === 'google') {
    const hasCredentials =
      Boolean(settings.googleKeyFile) || Boolean(settings.googleApplicationCredentials);
    return hasCredentials
      ? { effective: 'google', requested }
      : {
          effective: 'mock',
          requested,
          reason:
            'GOOGLE_VISION_KEY_FILE (or GOOGLE_APPLICATION_CREDENTIALS) is not set, so cheque images cannot be read',
        };
  }

  if (requested === 'claude') {
    return settings.anthropicApiKey
      ? { effective: 'claude', requested }
      : {
          effective: 'mock',
          requested,
          reason: 'ANTHROPIC_API_KEY is not set, so cheque images cannot be read',
        };
  }

  return { effective: 'mock', requested };
}

/** Builds the provider chosen by {@link resolveOcrProvider} and logs the choice. */
export function createOcrProvider(settings: OcrProviderSettings): OcrProvider {
  const logger = new Logger('OcrProvider');
  const resolution = resolveOcrProvider(settings);

  if (resolution.reason) {
    // Impossible to miss in the logs: an operator must never believe real OCR
    // is running when it is not.
    logger.error(
      [
        '',
        '  ┌─────────────────────────────────────────────────────────────────┐',
        '  │  OCR IS NOT READING YOUR CHEQUES                                │',
        '  └─────────────────────────────────────────────────────────────────┘',
        `  Requested provider : ${resolution.requested}`,
        `  Running instead    : mock (synthetic data — reads nothing)`,
        `  Reason             : ${resolution.reason}`,
        '',
        '  Every extracted value will be invented. Configure the provider,',
        '  or set OCR_PROVIDER=mock to silence this warning deliberately.',
        '',
      ].join('\n'),
    );
  } else {
    logger.log(`OCR provider: ${resolution.effective}`);
  }

  switch (resolution.effective) {
    case 'google':
      return new GoogleVisionOcrProvider({ keyFilename: settings.googleKeyFile });
    case 'claude':
      return new ClaudeVisionOcrProvider({
        // `resolveOcrProvider` only returns 'claude' once the key is present.
        apiKey: settings.anthropicApiKey as string,
        model: settings.claudeModel,
        maxTokens: settings.claudeMaxTokens,
      });
    case 'mock':
    default:
      return new MockOcrProvider({
        latencyMs: settings.mockLatencyMs,
        seed: settings.mockSeed,
      });
  }
}
