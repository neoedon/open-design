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
  it('falls back to the published JSON when the local snapshot responds non-OK', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('bad gateway', { status: 502 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(snapshot), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(loadDesignProjectsSnapshot()).resolves.toEqual({ snapshot, source: 'published' });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(DESIGN_PROJECTS_ENDPOINTS.snapshot);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain(DESIGN_PROJECTS_ENDPOINTS.publishedSnapshot);
  });

  it('falls back when the local snapshot returns a malformed success payload', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(snapshot), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(loadDesignProjectsSnapshot()).resolves.toEqual({ snapshot, source: 'published' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
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
