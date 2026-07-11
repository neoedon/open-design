import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DesignProjectsSnapshot } from '@open-design/contracts';

import {
  DESIGN_PROJECTS_ENDPOINTS,
  loadDesignProjectsSnapshot,
  loadDesignProjectsStatus,
  syncDesignProjects,
} from '../../../src/components/vision-design/design-projects-client';

const snapshot: DesignProjectsSnapshot = {
  schemaVersion: 1,
  generatedBy: 'test',
  syncedAt: '2026-07-11T00:00:00.000Z',
  source: { title: 'Test', wikiUrl: '', tableName: 'Tasks', includedTables: [], excludedTables: [], syncMode: 'snapshot' },
  fields: [],
  records: [],
  summary: { totalRecords: 0, completedRecords: 0, openRecords: 0, byPriority: {}, byDepartment: {}, byChannel: {} },
};

afterEach(() => vi.unstubAllGlobals());

describe('design projects client', () => {
  it('loads snapshots from the local daemon', async () => {
    const fetchMock = vi.fn(async (_input: string | URL) => (
      new Response(JSON.stringify(snapshot), { status: 200 })
    ));
    vi.stubGlobal('fetch', fetchMock);

    await expect(loadDesignProjectsSnapshot()).resolves.toEqual({ snapshot, source: 'daemon' });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe(DESIGN_PROJECTS_ENDPOINTS.snapshot);
  });

  it('does not send project data requests to a public fallback when the daemon fails', async () => {
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({ error: { message: 'bad gateway' } }),
      { status: 502 },
    ));
    vi.stubGlobal('fetch', fetchMock);

    await expect(loadDesignProjectsSnapshot()).rejects.toThrow('bad gateway');
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('rejects a malformed local snapshot instead of publishing or fetching it elsewhere', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(loadDesignProjectsSnapshot()).rejects.toThrow('本地设计项目快照格式无效');
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('surfaces nested daemon API error messages for status', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { code: 'FAILED', message: '状态读取失败' } }), { status: 500 })));
    await expect(loadDesignProjectsStatus()).rejects.toThrow('状态读取失败');
  });

  it('surfaces legacy string errors for sync', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'lark-cli unavailable' }), { status: 503 })));
    await expect(syncDesignProjects()).rejects.toThrow('lark-cli unavailable');
  });
});
