import { describe, expect, it } from 'vitest';
import type { DesignProjectDerivedRecord, DesignProjectsSnapshot } from '@open-design/contracts';

import {
  buildDesignProjectAnalytics,
  buildDesignProjectRecords,
  filterDesignProjectRecords,
} from '../../../src/components/vision-design/design-projects';

function derived(overrides: Partial<DesignProjectDerivedRecord>): DesignProjectDerivedRecord {
  return {
    title: '任务',
    completed: false,
    status: '未完成',
    priority: '中',
    proposer: '需求方',
    supplier: '交付方',
    assignee: '设计师',
    department: '品牌部',
    channel: [],
    product: [],
    medium: [],
    visualScale: '标准',
    size: '',
    createdAt: '2026-07-01 10:00:00',
    deadline: '2026-07-10 00:00:00',
    document: '',
    background: '',
    audience: '',
    successMetric: '',
    notice: '',
    attachmentCount: 0,
    ...overrides,
  };
}

const snapshot: DesignProjectsSnapshot = {
  schemaVersion: 1,
  generatedBy: 'test',
  syncedAt: '2026-07-11T00:00:00.000Z',
  source: {
    title: '设计项目',
    wikiUrl: '',
    tableName: '任务',
    includedTables: ['任务'],
    excludedTables: [],
    syncMode: 'snapshot',
  },
  fields: [],
  records: [
    { id: '1', fields: { 备注: '海外站' }, derived: derived({ title: '海外首页', priority: '高', channel: ['Shopify'] }) },
    { id: '2', fields: {}, derived: derived({ title: '品牌视频', department: '设计部', channel: ['品牌营销'] }) },
    { id: '3', fields: {}, derived: derived({ title: '已交付图标', completed: true, status: '已完成', priority: '高' }) },
  ],
  summary: {
    totalRecords: 3,
    completedRecords: 1,
    openRecords: 2,
    byPriority: {},
    byDepartment: {},
    byChannel: {},
  },
};

describe('design project view logic', () => {
  const records = buildDesignProjectRecords(snapshot);

  it('searches derived and raw field text and combines filters', () => {
    expect(filterDesignProjectRecords(records, { query: 'Shopify', status: 'all', priority: 'all', department: 'all' }).map((item) => item.id)).toEqual(['1']);
    expect(filterDesignProjectRecords(records, { query: '', status: '未完成', priority: '中', department: '设计部' }).map((item) => item.id)).toEqual(['2']);
  });

  it('builds completion and top distributions from the provided record set', () => {
    const analytics = buildDesignProjectAnalytics(records);
    expect(analytics).toMatchObject({ total: 3, done: 1, open: 2 });
    expect(analytics.completionRate).toBeCloseTo(100 / 3);
    expect(analytics.priorities[0]).toMatchObject({ label: '高', count: 2, ratio: 1 });
    expect(analytics.channels.map((entry) => entry.label)).toContain('Shopify');
  });
});
