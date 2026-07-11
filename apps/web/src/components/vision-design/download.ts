export class RemoteDownloadError extends Error {
  constructor(
    message: string,
    readonly sourceUrl: string,
  ) {
    super(message);
    this.name = 'RemoteDownloadError';
  }
}

export async function downloadRemoteAsset(url: string, fileName: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(url, { cache: 'no-store' });
  } catch {
    throw new RemoteDownloadError('无法连接资源服务，可改用原始链接打开。', url);
  }

  if (!response.ok) {
    throw new RemoteDownloadError(`资源下载失败（HTTP ${response.status}）。`, url);
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.style.display = 'none';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}

export function openExternalUrl(url: string): void {
  window.open(url, '_blank', 'noopener,noreferrer');
}
