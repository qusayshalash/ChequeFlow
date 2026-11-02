import { StorageService } from './storage.service';
import type { AppConfigService } from '../../config/app-config.service';

/**
 * Where a signed image link points.
 *
 * A signed link carries the host it was signed for. In production the API
 * reaches storage on the internal network, and signing with that address
 * gave every phone a link to a hostname it cannot reach — the cheque image
 * simply would not load, with nothing wrong anywhere the API could see.
 */
function storageWith(publicEndpoint?: string): StorageService {
  const config = {
    storage: {
      endpoint: 'http://storage:9000',
      publicEndpoint,
      region: 'us-east-1',
      bucket: 'cheque-images',
      accessKeyId: 'key',
      secretAccessKey: 'secret',
      forcePathStyle: true,
      signedUrlTtl: 300,
      maxUploadBytes: 10_000_000,
    },
    isProduction: false,
  } as unknown as AppConfigService;
  return new StorageService(config);
}

describe('StorageService.getSignedDownloadUrl', () => {
  it('signs for the public address when there is one', async () => {
    const url = new URL(
      await storageWith('https://files.example.com').getSignedDownloadUrl('org/cheque/front.jpg'),
    );
    expect(url.origin).toBe('https://files.example.com');
    expect(url.pathname).toBe('/cheque-images/org/cheque/front.jpg');
    expect(url.searchParams.get('X-Amz-Signature')).toBeTruthy();
  });

  it('signs for the one address when only one is configured', async () => {
    // Development: the same address serves the API and the browser.
    const url = new URL(await storageWith().getSignedDownloadUrl('org/cheque/front.jpg'));
    expect(url.origin).toBe('http://storage:9000');
  });
});
