import type { OcrChequeInput } from '@cheque-flow/shared-types';

import {
  GoogleVisionOcrProvider,
  type VisionClient,
  type VisionTextResponse,
} from './google-vision-ocr.provider';

const CHEQUE_TEXT = [
  'مصرف الراجحي',
  'رقم الشيك: 0012345',
  'تاريخ الاستحقاق 28/10/2026',
  'ادفعوا لأمر: شركة الأفق المحدودة',
  '1,500.50',
  'ريال سعودي',
  '⑈0012345⑈ ⑆123456789012⑆',
].join('\n');

function buildProvider(response: VisionTextResponse) {
  const documentTextDetection = jest.fn().mockResolvedValue([response]);
  const client = { documentTextDetection } as VisionClient;
  return { provider: new GoogleVisionOcrProvider({ client }), documentTextDetection };
}

const input: OcrChequeInput = {
  chequeId: 'cheque-1',
  organizationId: 'org-1',
  images: [
    {
      side: 'BACK',
      storageKey: 'k/back.jpg',
      mimeType: 'image/jpeg',
      bytes: new Uint8Array([0x01, 0x02]),
    },
    {
      side: 'FRONT',
      storageKey: 'k/front.jpg',
      mimeType: 'image/jpeg',
      bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]),
    },
  ],
  languageHints: ['ar', 'en'],
  expectedCurrency: 'SAR',
  knownBankNames: ['مصرف الراجحي'],
};

const okResponse: VisionTextResponse = {
  fullTextAnnotation: { text: CHEQUE_TEXT, pages: [{ confidence: 0.9 }] },
};

describe('GoogleVisionOcrProvider', () => {
  it('declares that it needs the image bytes', () => {
    const { provider } = buildProvider(okResponse);
    expect(provider.needsImageBytes).toBe(true);
    expect(provider.name).toBe('google-vision');
  });

  it('sends only the front image, with the language hints', async () => {
    const { provider, documentTextDetection } = buildProvider(okResponse);
    await provider.processCheque(input);

    expect(documentTextDetection).toHaveBeenCalledTimes(1);
    const request = documentTextDetection.mock.calls[0][0];
    // The front is sent even though the back came first in the list.
    expect(Buffer.from(request.image.content).equals(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe(
      true,
    );
    expect(request.imageContext.languageHints).toEqual(['ar', 'en']);
  });

  it('extracts the printed fields from the recognised text', async () => {
    const { provider } = buildProvider(okResponse);
    const result = await provider.processCheque(input);

    expect(result.provider).toBe('google-vision');
    expect(result.fields.chequeNumber.value).toBe('0012345');
    expect(result.fields.numericAmount.value).toBe('1500.50');
    expect(result.fields.dueDate.value).toBe('2026-10-28');
    expect(result.fields.bankName.value).toBe('مصرف الراجحي');
    expect(result.fields.accountNumber.value).toBe('123456789012');
    expect(result.overallConfidence).toBeGreaterThan(0);
  });

  it('scales confidence by the page confidence Vision reports', async () => {
    const sharp = buildProvider(okResponse);
    const blurry = buildProvider({
      fullTextAnnotation: { text: CHEQUE_TEXT, pages: [{ confidence: 0.4 }] },
    });

    const sharpResult = await sharp.provider.processCheque(input);
    const blurryResult = await blurry.provider.processCheque(input);
    expect(blurryResult.overallConfidence).toBeLessThan(sharpResult.overallConfidence);
  });

  it('reports the vendor error instead of returning empty fields', async () => {
    const { provider } = buildProvider({ error: { message: 'PERMISSION_DENIED' } });
    await expect(provider.processCheque(input)).rejects.toThrow(/PERMISSION_DENIED/);
  });

  it('fails when no text was found rather than saving a blank suggestion', async () => {
    const { provider } = buildProvider({ fullTextAnnotation: { text: '   ' } });
    await expect(provider.processCheque(input)).rejects.toThrow(/no text/);
  });

  it('refuses to run without image bytes', async () => {
    const { provider, documentTextDetection } = buildProvider(okResponse);
    await expect(
      provider.processCheque({
        ...input,
        images: [{ side: 'FRONT', storageKey: 'k/front.jpg', mimeType: 'image/jpeg' }],
      }),
    ).rejects.toThrow(/image bytes/);
    expect(documentTextDetection).not.toHaveBeenCalled();
  });

  it('never puts the recognised cheque text into the stored raw payload', async () => {
    const { provider } = buildProvider(okResponse);
    const result = await provider.processCheque(input);

    const raw = JSON.stringify(result.raw);
    expect(raw).not.toContain('1,500.50');
    expect(raw).not.toContain('0012345');
    expect(raw).not.toContain('شركة الأفق');
    expect(raw).toContain('google-vision');
  });

  it('leaves the signature field unread', async () => {
    const { provider } = buildProvider(okResponse);
    const result = await provider.processCheque(input);
    // Text recognition cannot see a signature; claiming otherwise would lie.
    expect(result.fields.signatureDetected.value).toBeNull();
  });
});
