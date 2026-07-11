import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const daemonRoot = fileURLToPath(new URL('../..', import.meta.url));
const cliEntry = fileURLToPath(new URL('../../src/cli.ts', import.meta.url));

const summary = {
  totalRecords: 2,
  completedRecords: 1,
  openRecords: 1,
  byPriority: { P0: 1, P1: 1 },
  byDepartment: { Design: 2 },
  byChannel: { Web: 2 },
};
const snapshot = {
  schemaVersion: 1,
  generatedBy: 'test',
  syncedAt: '2026-07-11T08:00:00.000Z',
  source: {
    title: 'Design projects',
    wikiUrl: '',
    tableName: 'Requests',
    includedTables: ['Requests'],
    excludedTables: [],
    syncMode: 'one-way-full-snapshot',
  },
  fields: [],
  ignoredFields: [],
  records: [],
  summary,
};

describe('od design-projects', () => {
  let server: http.Server;
  let baseUrl: string;
  let tempDir: string;
  let requests: Array<{ method: string | undefined; url: string | undefined }>;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'od-design-projects-cli-'));
    requests = [];
    server = http.createServer((request, response) => {
      requests.push({ method: request.method, url: request.url });
      request.resume();
      response.setHeader('content-type', 'application/json');
      if (request.method === 'GET' && request.url === '/api/design-projects/status') {
        response.end(JSON.stringify({
          canSync: true,
          configured: true,
          cliAvailable: true,
          snapshot: {
            syncedAt: snapshot.syncedAt,
            source: {
              title: snapshot.source.title,
              tableName: snapshot.source.tableName,
              syncMode: snapshot.source.syncMode,
            },
            summary,
          },
        }));
        return;
      }
      if (request.method === 'POST' && request.url === '/api/design-projects/sync') {
        response.end(JSON.stringify({
          ok: true,
          snapshot: {
            syncedAt: snapshot.syncedAt,
            source: {
              title: snapshot.source.title,
              tableName: snapshot.source.tableName,
              syncMode: snapshot.source.syncMode,
            },
            summary,
          },
        }));
        return;
      }
      if (request.method === 'GET' && request.url === '/api/design-projects/snapshot') {
        response.end(JSON.stringify(snapshot));
        return;
      }
      response.statusCode = 404;
      response.end(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'unexpected route' } }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    await rm(tempDir, { recursive: true, force: true });
  });

  async function runCli(args: string[]) {
    return execFileAsync(process.execPath, ['--import', 'tsx', cliEntry, ...args], {
      cwd: daemonRoot,
      env: { ...process.env },
    });
  }

  it('prints machine-readable status from the shared daemon endpoint', async () => {
    const result = await runCli([
      'design-projects', 'status', '--daemon-url', baseUrl, '--json',
    ]);
    expect(JSON.parse(result.stdout)).toMatchObject({
      canSync: true,
      configured: true,
      cliAvailable: true,
      snapshot: { summary: { totalRecords: 2 } },
    });
    expect(requests).toEqual([{ method: 'GET', url: '/api/design-projects/status' }]);
  });

  it('writes --out on the client only after sync succeeds', async () => {
    const output = path.join(tempDir, 'published-snapshot.json');
    const result = await runCli([
      'design-projects', 'sync', '--daemon-url', baseUrl, '--out', output, '--json',
    ]);
    expect(JSON.parse(result.stdout)).toMatchObject({ ok: true, out: output, bytes: expect.any(Number) });
    expect(JSON.parse(await readFile(output, 'utf8'))).toEqual(snapshot);
    expect(requests).toEqual([
      { method: 'POST', url: '/api/design-projects/sync' },
      { method: 'GET', url: '/api/design-projects/snapshot' },
    ]);
  });
});
