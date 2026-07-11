import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  DesignProjectsServiceError,
  createDesignProjectsService,
  parseLarkCliJson,
  resolveCommandOnPath,
  type DesignProjectsLarkCliRunner,
} from '../../src/design-projects/service.js';

const FIELD_FIXTURES = [
  { id: 'title', name: '需求名称 - Requirement Description * 必填项', type: 'text' },
  { id: 'done', name: '是否完成 - Status', type: 'checkbox' },
  { id: 'priority', name: '优先级 - Priority * 必填项', type: 'select' },
  { id: 'proposer', name: '需求方 - Proposer', type: 'user' },
  { id: 'department', name: '需求部门', type: 'select' },
  { id: 'channel', name: '渠道 - Channel', type: 'select', multiple: true },
  { id: 'attachment', name: '需求附件 - Attachment', type: 'attachment' },
];

class FakeLarkRunner implements DesignProjectsLarkCliRunner {
  calls: string[][] = [];
  stdinInputs: Array<string | undefined> = [];
  fail = false;
  delayMs = 0;
  includeTargetTable = true;
  forceHasMore = false;
  firstRecordTitle = '首页改版';

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async run(args: readonly string[], stdin?: string): Promise<unknown> {
    this.calls.push([...args]);
    this.stdinInputs.push(stdin);
    if (this.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    }
    if (this.fail) throw new Error('file_token=do-not-echo stderr=private');

    if (args[0] === 'wiki') {
      return {
        data: {
          node: {
            obj_type: 'bitable',
            obj_token: 'base-private-token',
            title: '设计项目需求提报系统',
          },
        },
      };
    }
    if (args.includes('+table-list')) {
      return {
        data: {
          tables: [
            ...(this.includeTargetTable
              ? [{ id: 'tbl-main-private', name: '设计项目需求提报' }]
              : []),
            { id: 'tbl-other-private', name: 'Vision Design' },
          ],
        },
      };
    }
    if (args.includes('+field-list')) {
      return { data: { fields: FIELD_FIXTURES } };
    }
    if (args.includes('+record-list')) {
      const offsetIndex = args.indexOf('--offset');
      const offset = args[offsetIndex + 1];
      if (offset === '0') {
        return {
          data: {
            data: [[
              this.firstRecordTitle,
              false,
              'P0',
              { name: 'Alice', open_id: 'ou-private', union_id: 'on-private' },
              '品牌部',
              [{ id: 'opt-private', name: 'Web' }],
              [{ file_token: 'file-private', name: 'brief.pdf' }],
            ]],
            field_id_list: FIELD_FIXTURES.map((field) => field.id),
            record_id_list: ['rec-1'],
            ignored_fields: [{ id: 'ignored-private', name: '创建任务', reason: 'not_support' }],
            has_more: true,
          },
        };
      }
      return {
        data: {
          data: [[
            '应用图标',
            true,
            'P1',
            { name: 'Bob', open_id: 'ou-private-2' },
            '产品部',
            [{ id: 'opt-private-2', name: 'App' }],
            [],
          ]],
          field_id_list: FIELD_FIXTURES.map((field) => field.id),
          record_id_list: ['rec-2'],
          has_more: this.forceHasMore,
        },
      };
    }
    throw new Error(`unexpected fake lark invocation: ${args.join(' ')}`);
  }
}

describe('design project snapshot service', () => {
  let dataDir: string;
  let runner: FakeLarkRunner;

  beforeEach(async () => {
    dataDir = await mkdtemp(path.join(os.tmpdir(), 'od-design-projects-'));
    runner = new FakeLarkRunner();
  });

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  function service() {
    return createDesignProjectsService({
      dataDir,
      runner,
      env: {
        FEISHU_DESIGN_PROJECT_WIKI_TOKEN: 'wiki-private-token',
        FEISHU_DESIGN_PROJECT_PUBLIC_WIKI_URL: 'https://example.test/public-source',
      },
      now: () => new Date('2026-07-11T08:00:00.000Z'),
    });
  }

  it('paginates records, derives summaries, and removes rich-value identifiers', async () => {
    const snapshot = await service().sync();

    expect(snapshot.records).toHaveLength(2);
    expect(snapshot.summary).toMatchObject({
      totalRecords: 2,
      openRecords: 1,
      completedRecords: 1,
      byPriority: { P0: 1, P1: 1 },
      byDepartment: { '品牌部': 1, '产品部': 1 },
      byChannel: { Web: 1, App: 1 },
    });
    expect(snapshot.records[0]?.fields['需求方 - Proposer']).toBe('Alice');
    expect(snapshot.records[0]?.fields['需求附件 - Attachment']).toEqual(['brief.pdf']);
    expect(runner.calls.filter((args) => args.includes('+record-list'))).toHaveLength(2);
    const wikiCallIndex = runner.calls.findIndex((args) => args[0] === 'wiki');
    expect(runner.calls[wikiCallIndex]).toContain('-');
    expect(runner.calls[wikiCallIndex]?.join(' ')).not.toContain('wiki-private-token');
    expect(JSON.parse(runner.stdinInputs[wikiCallIndex] ?? '{}')).toEqual({
      token: 'wiki-private-token',
    });

    const stored = await readFile(service().snapshotPath, 'utf8');
    expect(stored).not.toContain('wiki-private-token');
    expect(stored).not.toContain('base-private-token');
    expect(stored).not.toContain('tbl-main-private');
    expect(stored).not.toContain('file-private');
    expect(stored).not.toContain('ou-private');
    expect(stored).not.toContain('opt-private');
  });

  it('coalesces concurrent sync requests into one in-flight pass', async () => {
    runner.delayMs = 3;
    const subject = service();
    const first = subject.sync();
    const second = subject.sync();

    expect(second).toBe(first);
    await Promise.all([first, second]);
    expect(runner.calls.filter((args) => args[0] === 'wiki')).toHaveLength(1);
    expect(runner.calls.filter((args) => args.includes('+record-list'))).toHaveLength(2);
  });

  it('preserves the last good atomic snapshot when a refresh fails', async () => {
    const subject = service();
    await subject.sync();
    const before = await readFile(subject.snapshotPath, 'utf8');
    runner.fail = true;

    await expect(subject.sync()).rejects.toMatchObject({
      code: 'DESIGN_PROJECTS_SYNC_FAILED',
      message: 'Unable to refresh design projects from Feishu.',
    });
    expect(await readFile(subject.snapshotPath, 'utf8')).toBe(before);
    expect(await subject.readSnapshot()).toMatchObject({ syncedAt: '2026-07-11T08:00:00.000Z' });
  });

  it('fails closed instead of syncing the first unrelated table', async () => {
    runner.includeTargetTable = false;

    await expect(service().sync()).rejects.toMatchObject({
      code: 'DESIGN_PROJECTS_SYNC_FAILED',
      message: 'The configured design project table was not found: 设计项目需求提报.',
    });
    expect(runner.calls.some((args) => args.includes('+field-list'))).toBe(false);
  });

  it('stops runaway pagination at the bounded page limit', async () => {
    runner.forceHasMore = true;

    await expect(service().sync()).rejects.toMatchObject({
      code: 'DESIGN_PROJECTS_SYNC_FAILED',
      message: 'Feishu pagination exceeded the design project sync limit.',
    });
    expect(runner.calls.filter((args) => args.includes('+record-list'))).toHaveLength(100);
  });

  it('stops while building the first record that exceeds the snapshot byte budget', async () => {
    runner.firstRecordTitle = 'x'.repeat(20_000);
    const subject = createDesignProjectsService({
      dataDir,
      runner,
      env: { FEISHU_DESIGN_PROJECT_WIKI_TOKEN: 'wiki-private-token' },
      snapshotByteLimit: 8_000,
    });

    await expect(subject.sync()).rejects.toMatchObject({
      code: 'DESIGN_PROJECTS_SYNC_FAILED',
      message: 'The design project snapshot exceeded the 64 MiB safety limit.',
    });
    expect(runner.calls.filter((args) => args.includes('+record-list'))).toHaveLength(1);
    await expect(readFile(subject.snapshotPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('resolves the concrete CLI path that will be executed', async () => {
    const binDir = path.join(dataDir, 'bin');
    const cliPath = path.join(binDir, process.platform === 'win32' ? 'lark-cli.CMD' : 'lark-cli');
    await mkdir(binDir, { recursive: true });
    await writeFile(cliPath, process.platform === 'win32' ? '@echo off\r\n' : '#!/bin/sh\nexit 0\n', 'utf8');
    await chmod(cliPath, 0o755);

    await expect(resolveCommandOnPath('lark-cli', { PATH: binDir })).resolves.toBe(cliPath);
  });
});

describe('parseLarkCliJson', () => {
  it('accepts a JSON envelope surrounded by CLI notices', () => {
    expect(parseLarkCliJson('notice before\n{"ok":true,"data":{"count":2}}\nnotice after')).toEqual({
      ok: true,
      data: { count: 2 },
    });
  });

  it('returns a stable redacted error for malformed output', () => {
    expect(() => parseLarkCliJson('private-token without JSON')).toThrowError(
      new DesignProjectsServiceError(
        'DESIGN_PROJECTS_SYNC_FAILED',
        'Feishu returned an invalid response.',
      ),
    );
  });
});
