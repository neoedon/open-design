// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  downloadRemoteAsset,
  MAX_REMOTE_ASSET_BYTES,
} from '../../../src/components/vision-design/download';

afterEach(() => vi.unstubAllGlobals());

describe('remote Vision Design asset downloads', () => {
  it('rejects non-HTTPS remote origins before making a request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(downloadRemoteAsset('http://example.test/asset.pdf', 'asset.pdf')).rejects.toThrow(
      '仅允许从受信任的 HTTPS 地址下载资源',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects declared responses above the hard byte limit', async () => {
    const fetchMock = vi.fn(async () => new Response(new Uint8Array([1]), {
      headers: { 'content-length': String(MAX_REMOTE_ASSET_BYTES + 1) },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(downloadRemoteAsset('https://trusted.example/asset.pdf', 'asset.pdf')).rejects.toThrow(
      '超过 128 MiB',
    );
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
