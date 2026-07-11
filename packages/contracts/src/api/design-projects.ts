// Design project snapshot contracts shared by the Open Design web UI, daemon,
// and `od design-projects` CLI. Keep this module pure TypeScript: parsing,
// filesystem persistence, and Feishu/Lark execution belong to the daemon.

export interface DesignProjectSnapshotField {
  id: string;
  name: string;
  type?: string;
  multiple?: boolean;
  options?: unknown;
  style?: unknown;
  reason?: string;
}

export interface DesignProjectDerivedRecord {
  title: string;
  completed: boolean;
  status: string;
  priority: string;
  proposer: string;
  supplier: string;
  assignee: string;
  department: string;
  channel: string[];
  product: string[];
  medium: string[];
  visualScale: string;
  size: string;
  createdAt: string;
  deadline: string;
  document: string;
  background: string;
  audience: string;
  successMetric: string;
  notice: string;
  attachmentCount: number;
}

export interface DesignProjectSnapshotRecord {
  id: string;
  recordId?: string;
  fields: Record<string, unknown>;
  derived: DesignProjectDerivedRecord;
}

export interface DesignProjectsSnapshotSource {
  title: string;
  wikiUrl: string;
  tableName: string;
  includedTables: string[];
  excludedTables: string[];
  syncMode: string;
  pollIntervalMs?: number;
}

export interface DesignProjectsSnapshotSummary {
  totalRecords: number;
  completedRecords: number;
  openRecords: number;
  byPriority: Record<string, number>;
  byDepartment: Record<string, number>;
  byChannel: Record<string, number>;
}

export interface DesignProjectsSnapshot {
  schemaVersion: 1;
  generatedBy: string;
  syncedAt: string;
  source: DesignProjectsSnapshotSource;
  fields: DesignProjectSnapshotField[];
  ignoredFields?: DesignProjectSnapshotField[];
  records: DesignProjectSnapshotRecord[];
  summary: DesignProjectsSnapshotSummary;
}

export type DesignProjectsSyncUnavailableReason = 'missing-config' | 'missing-cli';

export interface DesignProjectsSnapshotMetadata {
  syncedAt: string;
  source: Pick<DesignProjectsSnapshotSource, 'title' | 'tableName' | 'syncMode'>;
  summary: DesignProjectsSnapshotSummary;
}

export interface DesignProjectsStatusResponse {
  canSync: boolean;
  configured: boolean;
  cliAvailable: boolean;
  reason?: DesignProjectsSyncUnavailableReason;
  snapshot: DesignProjectsSnapshotMetadata | null;
}

export interface DesignProjectsSyncResponse {
  ok: true;
  snapshot: DesignProjectsSnapshotMetadata;
}
