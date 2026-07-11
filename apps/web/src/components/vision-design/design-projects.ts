import type {
  DesignProjectDerivedRecord,
  DesignProjectSnapshotRecord,
  DesignProjectsSnapshot,
} from '@open-design/contracts';

export interface DesignProjectViewRecord extends DesignProjectSnapshotRecord {
  searchIndex: string;
}

export interface DesignProjectFilters {
  query: string;
  status: string;
  priority: string;
  department: string;
}

export interface DesignProjectCountEntry {
  label: string;
  count: number;
  ratio: number;
}

export interface DesignProjectAnalytics {
  total: number;
  done: number;
  open: number;
  completionRate: number;
  priorities: DesignProjectCountEntry[];
  departments: DesignProjectCountEntry[];
  channels: DesignProjectCountEntry[];
}

export function designProjectValueToText(value: unknown): string {
  if (value == null || value === '') return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(designProjectValueToText).filter(Boolean).join(' / ');
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of ['name', 'text', 'url', 'file_token']) {
      if (typeof record[key] === 'string' && record[key]) return String(record[key]);
    }
    return JSON.stringify(value);
  }
  return '';
}

function sortableTime(record: DesignProjectSnapshotRecord): number {
  for (const value of [record.derived.deadline, record.derived.createdAt]) {
    if (!value || value.startsWith('1970-01-01')) continue;
    const parsed = Date.parse(value.includes('T') ? value : value.replace(' ', 'T'));
    if (!Number.isNaN(parsed)) return parsed;
  }
  return 0;
}

export function buildDesignProjectRecords(snapshot: DesignProjectsSnapshot): DesignProjectViewRecord[] {
  return snapshot.records
    .map((record) => ({
      ...record,
      searchIndex: [
        record.id,
        record.derived.title,
        record.derived.status,
        record.derived.priority,
        record.derived.proposer,
        record.derived.supplier,
        record.derived.assignee,
        record.derived.department,
        ...record.derived.channel,
        ...record.derived.product,
        ...record.derived.medium,
        ...Object.values(record.fields).map(designProjectValueToText),
      ].join(' ').toLocaleLowerCase(),
    }))
    .sort((left, right) => {
      if (left.derived.completed !== right.derived.completed) return left.derived.completed ? 1 : -1;
      const timeDifference = sortableTime(right) - sortableTime(left);
      return timeDifference || left.derived.title.localeCompare(right.derived.title, 'zh-Hans-CN');
    });
}

export function filterDesignProjectRecords(
  records: DesignProjectViewRecord[],
  filters: DesignProjectFilters,
): DesignProjectViewRecord[] {
  const query = filters.query.trim().toLocaleLowerCase();
  return records.filter((record) => {
    if (filters.status !== 'all' && record.derived.status !== filters.status) return false;
    if (filters.priority !== 'all' && record.derived.priority !== filters.priority) return false;
    if (filters.department !== 'all' && record.derived.department !== filters.department) return false;
    return !query || record.searchIndex.includes(query);
  });
}

function countEntries(
  records: DesignProjectViewRecord[],
  getter: (record: DesignProjectViewRecord) => string | string[],
  limit = 5,
): DesignProjectCountEntry[] {
  const counts = new Map<string, number>();
  records.forEach((record) => {
    const raw = getter(record);
    const values = (Array.isArray(raw) ? raw : [raw]).map((item) => item.trim()).filter(Boolean);
    (values.length ? values : ['未设置']).forEach((value) => {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    });
  });
  const sorted = [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], 'zh-Hans-CN'))
    .slice(0, limit);
  const maximum = Math.max(1, ...sorted.map(([, count]) => count));
  return sorted.map(([label, count]) => ({ label, count, ratio: count / maximum }));
}

export function buildDesignProjectAnalytics(
  records: DesignProjectViewRecord[],
): DesignProjectAnalytics {
  const total = records.length;
  const done = records.filter((record) => record.derived.completed).length;
  return {
    total,
    done,
    open: total - done,
    completionRate: total ? (done / total) * 100 : 0,
    priorities: countEntries(records, (record) => record.derived.priority),
    departments: countEntries(records, (record) => record.derived.department),
    channels: countEntries(records, (record) => record.derived.channel),
  };
}

export function uniqueDerivedValues(
  records: DesignProjectViewRecord[],
  key: keyof DesignProjectDerivedRecord,
): string[] {
  return [...new Set(records.map((record) => record.derived[key]).filter(
    (value): value is string => typeof value === 'string' && Boolean(value),
  ))].sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'));
}
