import type {
  DesignProjectsSnapshot,
  DesignProjectsStatusResponse,
  DesignProjectsSyncResponse,
} from '@open-design/contracts';

import { visionDesignAssetUrl } from './config';

const SNAPSHOT_API = '/api/design-projects/snapshot';
const STATUS_API = '/api/design-projects/status';
const SYNC_API = '/api/design-projects/sync';
const PUBLISHED_SNAPSHOT_URL = visionDesignAssetUrl('data/feishu-base-snapshot.json');

export type DesignProjectsDataSource = 'daemon' | 'published';

export interface LoadedDesignProjectsSnapshot {
  snapshot: DesignProjectsSnapshot;
  source: DesignProjectsDataSource;
}

export class DesignProjectsRequestError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'DesignProjectsRequestError';
  }
}

function isDesignProjectsSnapshot(value: unknown): value is DesignProjectsSnapshot {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<DesignProjectsSnapshot>;
  return candidate.schemaVersion === 1
    && typeof candidate.syncedAt === 'string'
    && Boolean(candidate.source && typeof candidate.source.title === 'string')
    && Array.isArray(candidate.fields)
    && Array.isArray(candidate.records)
    && Boolean(candidate.summary && typeof candidate.summary.totalRecords === 'number');
}

async function responseMessage(response: Response): Promise<string> {
  const payload = (await response.json().catch(() => null)) as {
    message?: unknown;
    error?: unknown | { code?: unknown; message?: unknown };
  } | null;
  if (typeof payload?.message === 'string' && payload.message.trim()) return payload.message;
  if (typeof payload?.error === 'string' && payload.error.trim()) return payload.error;
  if (
    payload?.error &&
    typeof payload.error === 'object' &&
    'message' in payload.error &&
    typeof payload.error.message === 'string' &&
    payload.error.message.trim()
  ) return payload.error.message;
  return `HTTP ${response.status}`;
}

async function fetchPublishedSnapshot(): Promise<LoadedDesignProjectsSnapshot> {
  const response = await fetch(`${PUBLISHED_SNAPSHOT_URL}?t=${Date.now()}`, {
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new DesignProjectsRequestError(
      `已发布快照加载失败（HTTP ${response.status}）。`,
      response.status,
    );
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!isDesignProjectsSnapshot(payload)) {
    throw new DesignProjectsRequestError('已发布快照格式无效。');
  }
  return { snapshot: payload, source: 'published' };
}

export async function loadDesignProjectsSnapshot(): Promise<LoadedDesignProjectsSnapshot> {
  let response: Response;
  try {
    response = await fetch(SNAPSHOT_API, { cache: 'no-store' });
  } catch {
    return fetchPublishedSnapshot();
  }

  if (!response.ok) return fetchPublishedSnapshot();

  const payload: unknown = await response.json().catch(() => null);
  if (!isDesignProjectsSnapshot(payload)) return fetchPublishedSnapshot();
  return { snapshot: payload, source: 'daemon' };
}

export async function loadDesignProjectsStatus(): Promise<DesignProjectsStatusResponse | null> {
  let response: Response;
  try {
    response = await fetch(STATUS_API, { cache: 'no-store' });
  } catch {
    return null;
  }
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new DesignProjectsRequestError(
      `同步状态加载失败：${await responseMessage(response)}`,
      response.status,
    );
  }
  return (await response.json()) as DesignProjectsStatusResponse;
}

export async function syncDesignProjects(): Promise<DesignProjectsSyncResponse> {
  let response: Response;
  try {
    response = await fetch(SYNC_API, { method: 'POST', cache: 'no-store' });
  } catch {
    throw new DesignProjectsRequestError('无法连接本地 Open Design daemon。');
  }
  if (!response.ok) {
    throw new DesignProjectsRequestError(
      `从飞书 Base 同步失败：${await responseMessage(response)}`,
      response.status,
    );
  }
  return (await response.json()) as DesignProjectsSyncResponse;
}

export const DESIGN_PROJECTS_ENDPOINTS = {
  snapshot: SNAPSHOT_API,
  status: STATUS_API,
  sync: SYNC_API,
  publishedSnapshot: PUBLISHED_SNAPSHOT_URL,
} as const;
