'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { DesignProjectSnapshotField, DesignProjectsSnapshot } from '@open-design/contracts';
import {
  BarChart3,
  CheckCircle2,
  Database,
  ExternalLink,
  FileText,
  Loader2,
  RefreshCw,
  Search,
} from 'lucide-react';
import { Button, Input, Select } from '@open-design/components';

import {
  loadDesignProjectsSnapshot,
  loadDesignProjectsStatus,
  syncDesignProjects,
  type DesignProjectsDataSource,
} from './design-projects-client';
import {
  buildDesignProjectAnalytics,
  buildDesignProjectRecords,
  designProjectValueToText,
  filterDesignProjectRecords,
  uniqueDerivedValues,
  type DesignProjectCountEntry,
  type DesignProjectViewRecord,
} from './design-projects';
import styles from './DesignProjects.module.css';

export interface DesignProjectsViewProps {
  active: boolean;
}

function formatDate(value: string): string {
  if (!value || value.startsWith('1970-01-01')) return '未设置';
  return value.replace('T', ' ').slice(0, 16);
}

function formatSyncTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.replace('T', ' ').replace(/\.\d+Z$/, '');
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date).replace(/\//g, '-');
}

function Distribution({ title, entries }: { title: string; entries: DesignProjectCountEntry[] }) {
  return (
    <article className={styles.analyticsCard}>
      <header><span>{title}</span><strong>{entries.length}</strong></header>
      <div className={styles.distribution}>
        {entries.length ? entries.map((entry) => (
          <div className={styles.distributionRow} key={entry.label}>
            <span title={entry.label}>{entry.label}</span>
            <i aria-hidden="true"><b style={{ width: `${Math.max(4, entry.ratio * 100)}%` }} /></i>
            <strong>{entry.count}</strong>
          </div>
        )) : <span className={styles.muted}>暂无数据</span>}
      </div>
    </article>
  );
}

function FieldValue({ value }: { value: unknown }) {
  if (value == null || value === '' || (Array.isArray(value) && value.length === 0)) {
    return <span className={styles.emptyValue}>empty</span>;
  }
  if (Array.isArray(value)) {
    return (
      <span className={styles.valuePills}>
        {value.map((item, index) => <span key={`${designProjectValueToText(item)}:${index}`}>{designProjectValueToText(item)}</span>)}
      </span>
    );
  }
  if (typeof value === 'string') {
    const link = value.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/);
    if (link) return <a href={link[2]} rel="noreferrer" target="_blank">{link[1]} <ExternalLink aria-hidden="true" size={12} /></a>;
  }
  return <span className={styles.longValue}>{designProjectValueToText(value)}</span>;
}

function SummaryItem({ label, value }: { label: string; value: ReactNode }) {
  const displayValue = value === null || value === undefined || value === '' ? '未设置' : value;
  return <div className={styles.summaryItem}><span>{label}</span><strong>{displayValue}</strong></div>;
}

function DetailText({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return <div className={styles.detailText}><span>{label}</span><p>{value}</p></div>;
}

export function DesignProjectsView({ active }: DesignProjectsViewProps) {
  const [snapshot, setSnapshot] = useState<DesignProjectsSnapshot | null>(null);
  const [dataSource, setDataSource] = useState<DesignProjectsDataSource | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  async function fetchSnapshot(showLoading: boolean) {
    if (showLoading) setLoading(true);
    setError(null);
    try {
      const loaded = await loadDesignProjectsSnapshot();
      setSnapshot(loaded.snapshot);
      setDataSource(loaded.source);
      return loaded;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '设计项目快照加载失败。');
      return null;
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  useEffect(() => {
    if (!active) return;
    void fetchSnapshot(true);
  }, [active]);

  const records = useMemo(() => snapshot ? buildDesignProjectRecords(snapshot) : [], [snapshot]);
  const filteredRecords = useMemo(() => filterDesignProjectRecords(records, {
    query,
    status: statusFilter,
    priority: priorityFilter,
    department: departmentFilter,
  }), [departmentFilter, priorityFilter, query, records, statusFilter]);
  const analytics = useMemo(() => buildDesignProjectAnalytics(filteredRecords), [filteredRecords]);
  const priorityOptions = useMemo(() => uniqueDerivedValues(records, 'priority'), [records]);
  const departmentOptions = useMemo(() => uniqueDerivedValues(records, 'department'), [records]);
  const statusOptions = useMemo(() => uniqueDerivedValues(records, 'status'), [records]);
  const selected = filteredRecords.find((record) => record.id === selectedId) ?? filteredRecords[0] ?? null;

  useEffect(() => {
    if (selected && selected.id !== selectedId) setSelectedId(selected.id);
  }, [selected, selectedId]);

  async function refresh() {
    setRefreshing(true);
    setNotice(null);
    setError(null);
    try {
      const status = await loadDesignProjectsStatus();
      if (status?.canSync) {
        await syncDesignProjects();
        const loaded = await fetchSnapshot(false);
        if (loaded) setNotice('已从飞书 Base 同步并加载最新快照。');
      } else {
        const loaded = await fetchSnapshot(false);
        if (loaded) {
          setNotice('同步未配置，已重新读取本地快照。');
        }
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '刷新失败。');
    } finally {
      setRefreshing(false);
    }
  }

  if (loading && !snapshot) {
    return <div className={styles.centerState}><Loader2 aria-hidden="true" className={styles.spin} size={22} /><strong>正在加载设计项目…</strong></div>;
  }

  if (error && !snapshot) {
    return (
      <div className={styles.centerState} data-tone="error">
        <Database aria-hidden="true" size={22} />
        <strong>无法加载设计项目</strong>
        <span>{error}</span>
        <Button variant="ghost" onClick={() => void fetchSnapshot(true)}>重试</Button>
      </div>
    );
  }

  return (
    <section className={styles.root} aria-labelledby="design-projects-title">
      <header className={styles.pageHeader}>
        <div>
          <span className={styles.eyebrow}>飞书 Base · 只读快照</span>
          <h1 id="design-projects-title">设计项目看板</h1>
          <p>{snapshot?.source.title ?? '设计项目需求提报系统'} · {snapshot ? formatSyncTime(snapshot.syncedAt) : '未同步'}</p>
        </div>
        <div className={styles.headerActions}>
          <span className={styles.sourceBadge} data-source={dataSource}>
            {dataSource === 'daemon' ? '本地 daemon 快照' : '等待数据'}
          </span>
          {snapshot?.source.wikiUrl ? <a href={snapshot.source.wikiUrl} rel="noreferrer" target="_blank">查看来源 <ExternalLink aria-hidden="true" size={13} /></a> : null}
          <Button variant="ghost" disabled={refreshing} onClick={() => void refresh()}>
            {refreshing ? <Loader2 aria-hidden="true" className={styles.spin} size={14} /> : <RefreshCw aria-hidden="true" size={14} />}
            {refreshing ? '刷新中' : '刷新'}
          </Button>
        </div>
      </header>

      {error || notice ? <div className={styles.notice} data-tone={error ? 'error' : 'success'} role="status">{error ?? notice}</div> : null}

      <div className={styles.metrics}>
        <SummaryItem label="全部任务" value={snapshot?.summary.totalRecords ?? records.length} />
        <SummaryItem label="未完成" value={snapshot?.summary.openRecords ?? records.filter((item) => !item.derived.completed).length} />
        <SummaryItem label="已完成" value={snapshot?.summary.completedRecords ?? records.filter((item) => item.derived.completed).length} />
        <SummaryItem label="同步字段" value={snapshot?.fields.length ?? 0} />
      </div>

      <div className={styles.toolbar}>
        <label className={styles.searchField}>
          <Search aria-hidden="true" size={15} />
          <Input aria-label="搜索设计项目" placeholder="搜索需求、负责人、渠道或产品" type="search" value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
        <label><span>状态</span><Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">全部</option>{statusOptions.map((option) => <option key={option}>{option}</option>)}</Select></label>
        <label><span>优先级</span><Select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}><option value="all">全部</option>{priorityOptions.map((option) => <option key={option}>{option}</option>)}</Select></label>
        <label><span>部门</span><Select value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)}><option value="all">全部</option>{departmentOptions.map((option) => <option key={option}>{option}</option>)}</Select></label>
        <span className={styles.resultCount}>{filteredRecords.length} / {records.length}</span>
      </div>

      <div className={styles.analyticsGrid}>
        <article className={styles.analyticsCard}>
          <header><span>完成率</span><BarChart3 aria-hidden="true" size={14} /></header>
          <div className={styles.completion}><strong>{Math.round(analytics.completionRate)}%</strong><span>{analytics.done} 完成 · {analytics.open} 待处理</span></div>
          <div className={styles.progress} aria-label={`完成率 ${Math.round(analytics.completionRate)}%`}><i style={{ width: `${analytics.completionRate}%` }} /></div>
        </article>
        <Distribution title="优先级" entries={analytics.priorities} />
        <Distribution title="部门" entries={analytics.departments} />
        <Distribution title="渠道" entries={analytics.channels} />
      </div>

      <div className={styles.contentGrid}>
        <aside className={styles.taskList} aria-label="设计项目任务列表">
          <header><span>任务列表</span><strong>{filteredRecords.length}</strong></header>
          <div>
            {filteredRecords.length ? filteredRecords.map((record) => (
              <Button
                className={styles.taskRow}
                data-active={record.id === selected?.id}
                key={record.id}
                variant="ghost"
                onClick={() => setSelectedId(record.id)}
              >
                <span className={styles.taskState} data-completed={record.derived.completed}>{record.derived.completed ? <CheckCircle2 aria-hidden="true" size={14} /> : <FileText aria-hidden="true" size={14} />}</span>
                <span><strong>{record.derived.title}</strong><small>{record.derived.department} · {record.derived.priority} · {formatDate(record.derived.deadline)}</small></span>
              </Button>
            )) : <div className={styles.listEmpty}>没有符合当前筛选条件的任务。</div>}
          </div>
        </aside>

        <article className={styles.detailPanel}>
          {selected ? <ProjectDetail record={selected} fields={snapshot?.fields ?? []} /> : <div className={styles.detailEmpty}><Search aria-hidden="true" size={20} /><span>选择任务查看详情</span></div>}
        </article>
      </div>
    </section>
  );
}

function ProjectDetail({ record, fields }: { record: DesignProjectViewRecord; fields: DesignProjectSnapshotField[] }) {
  const view = record.derived;
  return (
    <>
      <header className={styles.detailHeader}>
        <div><span className={styles.eyebrow}>{view.status}</span><h2>{view.title}</h2></div>
        <span className={styles.priorityBadge}>{view.priority}</span>
      </header>
      <div className={styles.summaryGrid}>
        <SummaryItem label="截止时间" value={formatDate(view.deadline)} />
        <SummaryItem label="需求方" value={view.proposer} />
        <SummaryItem label="设计负责人" value={view.assignee} />
        <SummaryItem label="交付方" value={view.supplier} />
        <SummaryItem label="部门" value={view.department} />
        <SummaryItem label="视觉量级" value={view.visualScale} />
      </div>
      <div className={styles.detailTexts}>
        <DetailText label="背景与目标" value={view.background} />
        <DetailText label="目标受众" value={view.audience} />
        <DetailText label="成功指标" value={view.successMetric} />
        <DetailText label="备注" value={view.notice} />
      </div>
      <section className={styles.fieldTable}>
        <header><span>全部字段</span><strong>{fields.length}</strong></header>
        <div>
          {fields.map((field) => (
            <div className={styles.fieldRow} key={field.id}>
              <span><strong>{field.name}</strong><small>{field.type ?? 'unknown'}</small></span>
              <FieldValue value={record.fields[field.name]} />
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
