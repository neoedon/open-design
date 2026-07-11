import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import http from 'node:http';

import type { DesignProjectsSnapshot } from '@open-design/contracts';
import type { DesignProjectsService } from '../../src/design-projects/service.js';
import { sendApiError } from '../../src/http/api-errors.js';
import { requireLocalDaemonRequest } from '../../src/http/local-daemon-request.js';
import { registerDesignProjectsRoutes } from '../../src/routes/design-projects.js';

function snapshotFixture(): DesignProjectsSnapshot {
  return {
    schemaVersion: 1,
    generatedBy: 'test',
    syncedAt: '2026-07-11T08:00:00.000Z',
    source: {
      title: '设计项目需求提报系统',
      wikiUrl: '',
      tableName: '设计项目需求提报',
      includedTables: ['设计项目需求提报'],
      excludedTables: [],
      syncMode: 'one-way-full-snapshot',
    },
    fields: [],
    ignoredFields: [],
    records: [],
    summary: {
      totalRecords: 0,
      completedRecords: 0,
      openRecords: 0,
      byPriority: {},
      byDepartment: {},
      byChannel: {},
    },
  };
}

describe('design project routes', () => {
  let server: http.Server;
  let baseUrl: string;
  let currentSnapshot: DesignProjectsSnapshot | null;
  let syncCalls: number;

  beforeEach(async () => {
    currentSnapshot = null;
    syncCalls = 0;
    const service: DesignProjectsService = {
      snapshotPath: '/unused/snapshot.json',
      readSnapshot: async () => currentSnapshot,
      status: async () => ({
        canSync: true,
        configured: true,
        cliAvailable: true,
        snapshot: currentSnapshot
          ? {
              syncedAt: currentSnapshot.syncedAt,
              source: {
                title: currentSnapshot.source.title,
                tableName: currentSnapshot.source.tableName,
                syncMode: currentSnapshot.source.syncMode,
              },
              summary: currentSnapshot.summary,
            }
          : null,
      }),
      sync: async () => {
        syncCalls += 1;
        currentSnapshot = snapshotFixture();
        return currentSnapshot;
      },
    };
    const app = express();
    app.use(express.json());
    registerDesignProjectsRoutes(app, {
      http: {
        createSseResponse: () => undefined,
        isLocalSameOrigin: () => true,
        requireLocalDaemonRequest,
        resolvedPortRef: { current: 0 },
        sendApiError,
        sendLiveArtifactRouteError: () => undefined,
        sendMulterError: () => undefined,
      },
      designProjects: service,
    });
    server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  });

  it('reports status and a stable missing-snapshot API error', async () => {
    const statusResponse = await fetch(`${baseUrl}/api/design-projects/status`);
    expect(statusResponse.status).toBe(200);
    expect(await statusResponse.json()).toMatchObject({
      canSync: true,
      configured: true,
      cliAvailable: true,
      snapshot: null,
    });

    const snapshotResponse = await fetch(`${baseUrl}/api/design-projects/snapshot`);
    expect(snapshotResponse.status).toBe(404);
    expect(await snapshotResponse.json()).toEqual({
      error: {
        code: 'DESIGN_PROJECTS_SNAPSHOT_NOT_FOUND',
        message: 'No design project snapshot is available.',
      },
    });
  });

  it('syncs and then serves the refreshed snapshot', async () => {
    const syncResponse = await fetch(`${baseUrl}/api/design-projects/sync`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    expect(syncResponse.status).toBe(200);
    expect(await syncResponse.json()).toMatchObject({
      ok: true,
      snapshot: {
        syncedAt: '2026-07-11T08:00:00.000Z',
        summary: { totalRecords: 0 },
      },
    });
    expect(syncCalls).toBe(1);

    const snapshotResponse = await fetch(`${baseUrl}/api/design-projects/snapshot`);
    expect(snapshotResponse.status).toBe(200);
    expect(snapshotResponse.headers.get('cache-control')).toBe('private, no-store');
    expect(await snapshotResponse.json()).toMatchObject({
      schemaVersion: 1,
      syncedAt: '2026-07-11T08:00:00.000Z',
    });
  });

  it('rejects a non-local browser origin before running sync', async () => {
    const response = await fetch(`${baseUrl}/api/design-projects/sync`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://evil.example',
      },
      body: '{}',
    });
    expect(response.status).toBe(403);
    expect(syncCalls).toBe(0);
  });
});
