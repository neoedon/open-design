'use client';

import { useEffect, useState, type ReactNode } from 'react';
import type {
  DesignProjectsSnapshotMetadata,
  DesignProjectsStatusResponse,
} from '@open-design/contracts';
import { CheckCircle2, Cloud, Database, Loader2, RefreshCw, Server, Terminal } from 'lucide-react';
import { Button } from '@open-design/components';

import {
  loadDesignProjectsSnapshot,
  loadDesignProjectsStatus,
  syncDesignProjects,
  type DesignProjectsDataSource,
} from './design-projects-client';
import styles from './DesignProjects.module.css';

export interface DesignProjectSyncViewProps {
  active: boolean;
}

function metadataFromSnapshot(snapshot: Awaited<ReturnType<typeof loadDesignProjectsSnapshot>>['snapshot']): DesignProjectsSnapshotMetadata {
  return {
    syncedAt: snapshot.syncedAt,
    source: {
      title: snapshot.source.title,
      tableName: snapshot.source.tableName,
      syncMode: snapshot.source.syncMode,
    },
    summary: snapshot.summary,
  };
}

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false });
}

export function DesignProjectSyncView({ active }: DesignProjectSyncViewProps) {
  const [status, setStatus] = useState<DesignProjectsStatusResponse | null>(null);
  const [metadata, setMetadata] = useState<DesignProjectsSnapshotMetadata | null>(null);
  const [source, setSource] = useState<DesignProjectsDataSource | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function loadStatus() {
    setLoading(true);
    setError(null);
    let localError: string | null = null;
    try {
      try {
        const nextStatus = await loadDesignProjectsStatus();
        setStatus(nextStatus);
      } catch (caught) {
        setStatus(null);
        localError = caught instanceof Error ? caught.message : '本地同步状态加载失败。';
      }

      const loaded = await loadDesignProjectsSnapshot();
      setSource(loaded.source);
      setMetadata(metadataFromSnapshot(loaded.snapshot));
      if (localError) setError(`${localError} 已继续读取可用快照。`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '同步状态加载失败。');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (active) void loadStatus();
  }, [active]);

  async function syncNow() {
    if (!status?.canSync) return;
    setSyncing(true);
    setError(null);
    setNotice(null);
    try {
      const result = await syncDesignProjects();
      setMetadata(result.snapshot);
      setSource('daemon');
      setNotice(`同步完成：${result.snapshot.summary.totalRecords} 条任务，${result.snapshot.summary.openRecords} 条待处理。`);
      const nextStatus = await loadDesignProjectsStatus();
      setStatus(nextStatus);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '从飞书 Base 同步失败。');
    } finally {
      setSyncing(false);
    }
  }

  const unavailableReason = status?.reason === 'missing-cli'
    ? '本机未找到 lark-cli，请安装并完成登录。'
    : status?.reason === 'missing-config'
      ? '尚未配置设计项目 Wiki URL 或 token。'
      : status === null
        ? '当前没有可用的本地 daemon 同步接口，只能读取已发布快照。'
        : null;

  return (
    <section className={styles.syncRoot} aria-labelledby="design-project-sync-title">
      <header className={styles.pageHeader}>
        <div>
          <span className={styles.eyebrow}>本地 daemon · 单向同步</span>
          <h1 id="design-project-sync-title">本地设计项目同步</h1>
          <p>检查本地配置和 lark-cli，并手动从飞书 Base 拉取最新只读快照。</p>
        </div>
        <div className={styles.headerActions}>
          <Button variant="ghost" disabled={loading || syncing} onClick={() => void loadStatus()}>
            <RefreshCw aria-hidden="true" className={loading ? styles.spin : undefined} size={14} />
            刷新状态
          </Button>
          <Button variant="primary" disabled={!status?.canSync || syncing} onClick={() => void syncNow()}>
            {syncing ? <Loader2 aria-hidden="true" className={styles.spin} size={14} /> : <Database aria-hidden="true" size={14} />}
            {syncing ? '同步中' : '立即同步'}
          </Button>
        </div>
      </header>

      {error || notice ? <div className={styles.notice} data-tone={error ? 'error' : 'success'} role="status">{error ?? notice}</div> : null}

      {loading && !metadata ? (
        <div className={styles.centerState}><Loader2 aria-hidden="true" className={styles.spin} size={22} /><strong>正在检查同步环境…</strong></div>
      ) : (
        <>
          <div className={styles.syncStatusGrid}>
            <StatusCard icon={<Server size={18} />} label="daemon 同步接口" ok={Boolean(status)} value={status ? '已连接' : '不可用'} />
            <StatusCard icon={<Database size={18} />} label="Base 来源配置" ok={Boolean(status?.configured)} value={status?.configured ? '已配置' : '未配置'} />
            <StatusCard icon={<Terminal size={18} />} label="lark-cli" ok={Boolean(status?.cliAvailable)} value={status?.cliAvailable ? '可用' : '不可用'} />
            <StatusCard
              icon={<Cloud size={18} />}
              label="当前数据源"
              ok={Boolean(metadata)}
              value={source === 'daemon' ? '本地快照' : source === 'published' ? '已发布快照' : '不可用'}
            />
          </div>

          {unavailableReason ? <div className={styles.explanation}><strong>为什么不能同步？</strong><p>{unavailableReason}</p></div> : null}

          {metadata ? (
            <article className={styles.snapshotCard}>
              <header><div><span className={styles.eyebrow}>当前快照</span><h2>{metadata.source.title}</h2></div><span className={styles.sourceBadge} data-source={source}>{source === 'daemon' ? '本地' : '静态发布'}</span></header>
              <div className={styles.snapshotMeta}>
                <SummaryItem label="数据表" value={metadata.source.tableName} />
                <SummaryItem label="同步时间" value={formatTime(metadata.syncedAt)} />
                <SummaryItem label="全部任务" value={metadata.summary.totalRecords} />
                <SummaryItem label="未完成" value={metadata.summary.openRecords} />
                <SummaryItem label="已完成" value={metadata.summary.completedRecords} />
                <SummaryItem label="同步模式" value={metadata.source.syncMode} />
              </div>
            </article>
          ) : null}
        </>
      )}
    </section>
  );
}

function StatusCard({ icon, label, ok, value }: { icon: ReactNode; label: string; ok: boolean; value: string }) {
  return <article className={styles.statusCard} data-ok={ok}><span>{icon}</span><div><small>{label}</small><strong>{value}</strong></div>{ok ? <CheckCircle2 aria-hidden="true" size={15} /> : null}</article>;
}

function SummaryItem({ label, value }: { label: string; value: ReactNode }) {
  return <div className={styles.summaryItem}><span>{label}</span><strong>{value}</strong></div>;
}
