export class RemoteDownloadError extends Error {
  constructor(
    message: string,
    readonly sourceUrl: string,
  ) {
    super(message);
    this.name = 'RemoteDownloadError';
  }
}

export const MAX_REMOTE_ASSET_BYTES = 128 * 1024 * 1024;
export const REMOTE_ASSET_TIMEOUT_MS = 120_000;

let remoteDownloadInFlight = false;

function safeRemoteUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new RemoteDownloadError('资源地址无效。', value);
  }
  const localDevelopment = url.protocol === 'http:'
    && (url.hostname === '127.0.0.1' || url.hostname === 'localhost');
  if (url.protocol !== 'https:' && !localDevelopment) {
    throw new RemoteDownloadError('仅允许从受信任的 HTTPS 地址下载资源。', value);
  }
  return url;
}

async function responseBlobWithinLimit(response: Response, sourceUrl: string): Promise<Blob> {
  const declaredBytes = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredBytes) && declaredBytes > MAX_REMOTE_ASSET_BYTES) {
    throw new RemoteDownloadError('资源超过 128 MiB 下载上限。', sourceUrl);
  }
  if (!response.body) {
    throw new RemoteDownloadError('资源服务未提供可安全读取的响应流。', sourceUrl);
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_REMOTE_ASSET_BYTES) {
        await reader.cancel('remote asset exceeded byte limit').catch(() => undefined);
        throw new RemoteDownloadError('资源超过 128 MiB 下载上限。', sourceUrl);
      }
      chunks.push(new Uint8Array(value));
    }
  } finally {
    reader.releaseLock();
  }
  return new Blob(chunks, { type: response.headers.get('content-type') || undefined });
}

export async function downloadRemoteAsset(url: string, fileName: string): Promise<void> {
  if (remoteDownloadInFlight) {
    throw new RemoteDownloadError('已有资源正在下载，请稍后再试。', url);
  }
  remoteDownloadInFlight = true;
  try {
    const sourceUrl = safeRemoteUrl(url).toString();
    let response: Response;
    try {
      response = await fetch(sourceUrl, {
        cache: 'no-store',
        signal: AbortSignal.timeout(REMOTE_ASSET_TIMEOUT_MS),
      });
    } catch (error) {
      const timedOut = error instanceof DOMException
        && (error.name === 'AbortError' || error.name === 'TimeoutError');
      throw new RemoteDownloadError(
        timedOut ? '资源下载超时，可改用原始链接打开。' : '无法连接资源服务，可改用原始链接打开。',
        sourceUrl,
      );
    }

    if (!response.ok) {
      throw new RemoteDownloadError(`资源下载失败（HTTP ${response.status}）。`, sourceUrl);
    }

    const blob = await responseBlobWithinLimit(response, sourceUrl);
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = fileName;
    anchor.style.display = 'none';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  } finally {
    remoteDownloadInFlight = false;
  }
}

export function openExternalUrl(url: string): void {
  window.open(safeRemoteUrl(url).toString(), '_blank', 'noopener,noreferrer');
}
