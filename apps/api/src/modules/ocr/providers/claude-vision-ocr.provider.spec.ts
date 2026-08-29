import type Anthropic from '@anthropic-ai/sdk';

import type { OcrChequeInput } from '@cheque-flow/shared-types';

import { ClaudeVisionOcrProvider } from './claude-vision-ocr.provider';

/** A field as the model reports it. */
function field(value: unknown, confidence = 0.95, rawText: string | null = null) {
  return { value, confidence, rawText };
}

function fullExtraction(overrides: Record<string, unknown> = {}) {
  return {
    chequeNumber: field('00123456'),
    numericAmount: field('1500.50'),
    writtenAmount: field('فقط ألف وخمسمائة ريال وخمسون هللة لا غير', 0.62),
    currency: field('SAR'),
    issueDate: field('2026-08-01'),
    dueDate: field('2026-10-28'),
    drawerName: field('مؤسسة النخبة للتجارة', 0.81),
    payeeName: field('شركة الأفق المحدودة', 0.74),
    bankName: field('مصرف الراجحي'),
    bankBranch: field(null, 0.4),
    accountNumber: field('123456789012'),
    micr: field('⑈00123456⑈ ⑆123456789⑆'),
    signatureDetected: field(true, 0.88),
    ...overrides,
  };
}

/** Builds a provider whose SDK client is a stub — no network access. */
function buildProvider(response: unknown) {
  const parse = jest.fn().mockResolvedValue(response);
  const client = { messages: { parse } } as unknown as Anthropic;
  const provider = new ClaudeVisionOcrProvider({
    apiKey: 'test-key',
    model: 'claude-opus-5',
    maxTokens: 8000,
    client,
  });
  return { provider, parse };
}

function successResponse(parsedOutput: Record<string, unknown>) {
  return {
    id: 'msg_test_1',
    model: 'claude-opus-5',
    stop_reason: 'end_turn',
    usage: { input_tokens: 1200, output_tokens: 300 },
    parsed_output: parsedOutput,
  };
}

const FRONT_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
const FRONT_BASE64 = Buffer.from(FRONT_BYTES).toString('base64');

const input: OcrChequeInput = {
  chequeId: 'cheque-1',
  organizationId: 'org-1',
  images: [
    {
      side: 'FRONT',
      storageKey: 'k/front.jpg',
      mimeType: 'image/jpeg',
      bytes: FRONT_BYTES,
    },
  ],
  languageHints: ['ar', 'en'],
  expectedCurrency: 'SAR',
};

describe('ClaudeVisionOcrProvider', () => {
  it('declares that it needs the image bytes', () => {
    const { provider } = buildProvider(successResponse(fullExtraction()));
    expect(provider.needsImageBytes).toBe(true);
    expect(provider.name).toBe('claude-vision');
  });

  it('sends the image as a base64 block with its real media type', async () => {
    const { provider, parse } = buildProvider(successResponse(fullExtraction()));
    await provider.processCheque(input);

    const request = parse.mock.calls[0][0];
    expect(request.model).toBe('claude-opus-5');

    const blocks = request.messages[0].content;
    const image = blocks.find((block: { type: string }) => block.type === 'image');
    expect(image.source.media_type).toBe('image/jpeg');
    expect(image.source.data).toBe(FRONT_BASE64);
  });

  it('constrains the response with a structured output schema', async () => {
    const { provider, parse } = buildProvider(successResponse(fullExtraction()));
    await provider.processCheque(input);
    expect(parse.mock.calls[0][0].output_config.format).toBeDefined();
  });

  it('maps every documented field through', async () => {
    const { provider } = buildProvider(successResponse(fullExtraction()));
    const result = await provider.processCheque(input);

    expect(result.provider).toBe('claude-vision');
    expect(result.providerRequestId).toBe('msg_test_1');
    expect(result.fields.chequeNumber.value).toBe('00123456');
    expect(result.fields.numericAmount.value).toBe('1500.50');
    expect(result.fields.signatureDetected.value).toBe(true);
    expect(result.overallConfidence).toBeGreaterThan(0);
  });

  it('normalises Arabic-Indic digits and separators in the amount', async () => {
    const { provider } = buildProvider(
      successResponse(fullExtraction({ numericAmount: field('١٬٥٠٠٫٥٠') })),
    );
    const result = await provider.processCheque(input);
    expect(result.fields.numericAmount.value).toBe('1500.50');
  });

  it('strips thousands separators', async () => {
    const { provider } = buildProvider(
      successResponse(fullExtraction({ numericAmount: field('12,345.67') })),
    );
    const result = await provider.processCheque(input);
    expect(result.fields.numericAmount.value).toBe('12345.67');
  });

  it('rejects an amount that is not a number instead of passing junk on', async () => {
    const { provider } = buildProvider(
      successResponse(fullExtraction({ numericAmount: field('about 1500') })),
    );
    const result = await provider.processCheque(input);
    expect(result.fields.numericAmount.value).toBeNull();
    expect(result.fields.numericAmount.confidence).toBe(0);
    expect(result.fields.numericAmount.rawText).toBe('about 1500');
  });

  it('rejects a currency that is not an ISO code', async () => {
    const { provider } = buildProvider(
      successResponse(fullExtraction({ currency: field('riyals') })),
    );
    const result = await provider.processCheque(input);
    expect(result.fields.currency.value).toBeNull();
  });

  it('uppercases a lowercase currency code', async () => {
    const { provider } = buildProvider(successResponse(fullExtraction({ currency: field('sar') })));
    const result = await provider.processCheque(input);
    expect(result.fields.currency.value).toBe('SAR');
  });

  it('forces confidence to zero for a field it could not read', async () => {
    const { provider } = buildProvider(
      // The model claims high confidence while reporting no value.
      successResponse(fullExtraction({ bankBranch: field(null, 0.99) })),
    );
    const result = await provider.processCheque(input);
    expect(result.fields.bankBranch.value).toBeNull();
    expect(result.fields.bankBranch.confidence).toBe(0);
  });

  it('treats a blank string as unread', async () => {
    const { provider } = buildProvider(
      successResponse(fullExtraction({ drawerName: field('   ') })),
    );
    const result = await provider.processCheque(input);
    expect(result.fields.drawerName.value).toBeNull();
  });

  it('clamps an out-of-range confidence', async () => {
    const { provider } = buildProvider(
      successResponse(fullExtraction({ chequeNumber: field('00123456', 4.2) })),
    );
    const result = await provider.processCheque(input);
    expect(result.fields.chequeNumber.confidence).toBe(1);
  });

  it('fails when the model declines the request', async () => {
    const { provider } = buildProvider({
      ...successResponse(fullExtraction()),
      stop_reason: 'refusal',
      parsed_output: null,
    });
    await expect(provider.processCheque(input)).rejects.toThrow(/declined/);
  });

  it('fails when no structured output came back', async () => {
    const { provider } = buildProvider({
      ...successResponse(fullExtraction()),
      parsed_output: null,
    });
    await expect(provider.processCheque(input)).rejects.toThrow(/no structured output/);
  });

  it('refuses to run without image bytes', async () => {
    const { provider, parse } = buildProvider(successResponse(fullExtraction()));
    await expect(
      provider.processCheque({
        ...input,
        images: [{ side: 'FRONT', storageKey: 'k/front.jpg', mimeType: 'image/jpeg' }],
      }),
    ).rejects.toThrow(/image bytes/);
    expect(parse).not.toHaveBeenCalled();
  });

  it('never puts the image or the read values into the stored raw payload', async () => {
    const { provider } = buildProvider(successResponse(fullExtraction()));
    const result = await provider.processCheque(input);

    const raw = JSON.stringify(result.raw);
    expect(raw).not.toContain('1500.50');
    expect(raw).not.toContain('00123456');
    expect(raw).not.toContain(FRONT_BASE64);
    expect(raw).toContain('claude-opus-5');
  });
});
