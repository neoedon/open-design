import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { access, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { delimiter, dirname, join } from 'node:path';
import { createCommandInvocation, wellKnownUserToolchainBins } from '@open-design/platform';

import type {
  DesignProjectDerivedRecord,
  DesignProjectSnapshotField,
  DesignProjectSnapshotRecord,
  DesignProjectsSnapshot,
  DesignProjectsSnapshotMetadata,
  DesignProjectsSnapshotSummary,
  DesignProjectsStatusResponse,
} from '@open-design/contracts';

const DEFAULT_TABLE_NAME = '设计项目需求提报';
const RECORD_PAGE_SIZE = 200;
const MAX_RECORD_PAGES = 100;
const MAX_DESIGN_PROJECT_RECORDS = 20_000;
const MAX_SNAPSHOT_BYTES = 64 * 1024 * 1024;
const MAX_SYNC_DURATION_MS = 10 * 60 * 1000;
const LARK_CLI_TIMEOUT_MS = 120_000;
const LARK_CLI_MAX_BUFFER_BYTES = 32 * 1024 * 1024;
const SNAPSHOT_FILE_NAME = 'snapshot.json';

type JsonRecord = Record<string, unknown>;

export type DesignProjectsServiceErrorCode =
  | 'DESIGN_PROJECTS_NOT_CONFIGURED'
  | 'DESIGN_PROJECTS_CLI_UNAVAILABLE'
  | 'DESIGN_PROJECTS_SYNC_FAILED'
  | 'DESIGN_PROJECTS_SNAPSHOT_INVALID'
  | 'DESIGN_PROJECTS_SNAPSHOT_WRITE_FAILED';

export class DesignProjectsServiceError extends Error {
  constructor(
    public readonly code: DesignProjectsServiceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DesignProjectsServiceError';
  }
}

export interface DesignProjectsLarkCliRunner {
  isAvailable(): Promise<boolean>;
  run(args: readonly string[], stdin?: string): Promise<unknown>;
}

export interface DesignProjectsService {
  readonly snapshotPath: string;
  readSnapshot(): Promise<DesignProjectsSnapshot | null>;
  status(): Promise<DesignProjectsStatusResponse>;
  sync(): Promise<DesignProjectsSnapshot>;
}

export interface CreateDesignProjectsServiceOptions {
  dataDir: string;
  env?: NodeJS.ProcessEnv;
  runner?: DesignProjectsLarkCliRunner;
  now?: () => Date;
  /** Allows tests and constrained embedders to lower, but never raise, the safety limit. */
  snapshotByteLimit?: number;
}

interface DesignProjectsConfig {
  wikiToken: string;
  publicWikiUrl: string;
  tableName: string;
}

function snapshotSizeLimitError(): DesignProjectsServiceError {
  return new DesignProjectsServiceError(
    'DESIGN_PROJECTS_SYNC_FAILED',
    'The design project snapshot exceeded the 64 MiB safety limit.',
  );
}

function normalizedSnapshotByteLimit(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return MAX_SNAPSHOT_BYTES;
  return Math.min(MAX_SNAPSHOT_BYTES, Math.max(1, Math.floor(value)));
}

function createSnapshotSizeBudget(limitBytes: number): { add(value: unknown): void } {
  let consumedBytes = 0;
  return {
    add(value) {
      const serialized = JSON.stringify(value);
      consumedBytes += Buffer.byteLength(serialized === undefined ? 'null' : serialized);
      if (consumedBytes > limitBytes) throw snapshotSizeLimitError();
    },
  };
}

function asRecord(value: unknown): JsonRecord | null {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(stringValue).filter(Boolean);
}

function wikiTokenFromUrl(url: string): string {
  return url.match(/\/wiki\/([^/?#]+)/)?.[1] ?? '';
}

function readConfig(env: NodeJS.ProcessEnv): DesignProjectsConfig {
  const wikiUrl = stringValue(env.FEISHU_DESIGN_PROJECT_WIKI_URL);
  const explicitWikiToken = stringValue(env.FEISHU_DESIGN_PROJECT_WIKI_TOKEN);
  return {
    wikiToken: explicitWikiToken || wikiTokenFromUrl(wikiUrl),
    publicWikiUrl: stringValue(env.FEISHU_DESIGN_PROJECT_PUBLIC_WIKI_URL),
    tableName: stringValue(env.FEISHU_DESIGN_PROJECT_TABLE_NAME) || DEFAULT_TABLE_NAME,
  };
}

function envPath(env: NodeJS.ProcessEnv): string {
  const entry = Object.entries(env).find(([key]) => key.toLowerCase() === 'path');
  return typeof entry?.[1] === 'string' ? entry[1] : '';
}

function commandSearchDirectories(env: NodeJS.ProcessEnv): string[] {
  return [...new Set([
    ...envPath(env).split(delimiter).filter(Boolean),
    ...wellKnownUserToolchainBins({ env }),
  ])];
}

export async function resolveCommandOnPath(
  command: string,
  env: NodeJS.ProcessEnv,
): Promise<string | null> {
  const extensions = process.platform === 'win32'
    ? stringValue(env.PATHEXT || '.EXE;.CMD;.BAT')
        .split(';')
        .map((extension) => extension.trim())
        .filter(Boolean)
    : [''];
  for (const directory of commandSearchDirectories(env)) {
    for (const extension of extensions) {
      const candidate = join(directory, `${command}${extension}`);
      try {
        await access(candidate, fsConstants.X_OK);
        return candidate;
      } catch {
        // Continue through PATH candidates.
      }
    }
  }
  return null;
}

export function parseLarkCliJson(stdout: string): unknown {
  const body = stdout.trim();
  if (!body) {
    throw new DesignProjectsServiceError(
      'DESIGN_PROJECTS_SYNC_FAILED',
      'Feishu returned an empty response.',
    );
  }
  try {
    return JSON.parse(body) as unknown;
  } catch {
    const start = body.indexOf('{');
    const end = body.lastIndexOf('}');
    if (start >= 0 && end >= start) {
      try {
        return JSON.parse(body.slice(start, end + 1)) as unknown;
      } catch {
        // Fall through to the stable, redacted error below.
      }
    }
  }
  throw new DesignProjectsServiceError(
    'DESIGN_PROJECTS_SYNC_FAILED',
    'Feishu returned an invalid response.',
  );
}

export function createDefaultDesignProjectsLarkCliRunner(
  env: NodeJS.ProcessEnv = process.env,
): DesignProjectsLarkCliRunner {
  let commandPromise: Promise<string | null> | null = null;
  const resolveCommand = () => {
    commandPromise ??= resolveCommandOnPath('lark-cli', env);
    return commandPromise;
  };
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path') ?? 'PATH';
  const childEnv = {
    ...env,
    [pathKey]: commandSearchDirectories(env).join(delimiter),
  };
  return {
    isAvailable: async () => Boolean(await resolveCommand()),
    run: async (args, stdin) => {
      const command = await resolveCommand();
      if (!command) {
        throw new DesignProjectsServiceError(
          'DESIGN_PROJECTS_CLI_UNAVAILABLE',
          'The local Feishu CLI is unavailable.',
        );
      }
      const invocation = createCommandInvocation({ command, args: [...args], env: childEnv });
      return new Promise((resolve, reject) => {
        const child = execFile(
          invocation.command,
          invocation.args,
          {
            encoding: 'utf8',
            env: childEnv,
            maxBuffer: LARK_CLI_MAX_BUFFER_BYTES,
            timeout: LARK_CLI_TIMEOUT_MS,
            windowsVerbatimArguments: invocation.windowsVerbatimArguments,
            windowsHide: true,
          },
          (error, stdout) => {
            if (error) {
              reject(new DesignProjectsServiceError(
                'DESIGN_PROJECTS_SYNC_FAILED',
                'Unable to refresh design projects from Feishu.',
              ));
              return;
            }
            try {
              resolve(parseLarkCliJson(String(stdout ?? '')));
            } catch (parseError) {
              reject(parseError);
            }
          },
        );
        child.stdin?.on('error', () => undefined);
        child.stdin?.end(stdin);
      });
    },
  };
}

function isSensitiveComplexKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return (
    normalized === 'id' ||
    normalized.endsWith('_id') ||
    normalized.includes('token') ||
    normalized.includes('open_id') ||
    normalized.includes('union_id') ||
    normalized.includes('tenant_key') ||
    normalized.includes('avatar_key')
  );
}

function isEmptySanitizedValue(value: unknown): boolean {
  if (value === '') return true;
  if (Array.isArray(value)) return value.length === 0;
  const record = asRecord(value);
  return record != null && Object.keys(record).length === 0;
}

/**
 * Reduce rich Feishu values to display-safe JSON. Known user/text/link values
 * keep their human-readable label, attachment tokens become a generic label,
 * and identifier/token-bearing keys are dropped recursively. There is no raw
 * JSON-stringify fallback, so an unrecognised object cannot leak credentials.
 */
export function sanitizeDesignProjectFieldValue(value: unknown, depth = 0): unknown {
  if (value == null || value === '') return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (depth >= 6) return '';
  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeDesignProjectFieldValue(item, depth + 1))
      .filter((item) => !isEmptySanitizedValue(item));
  }

  const record = asRecord(value);
  if (!record) return '';
  if ('file_token' in record) {
    return stringValue(record.name) || 'attachment';
  }
  for (const labelKey of ['name', 'text', 'url'] as const) {
    const label = stringValue(record[labelKey]);
    if (label) return label;
  }

  const safeEntries: Array<[string, unknown]> = [];
  for (const [key, child] of Object.entries(record)) {
    if (isSensitiveComplexKey(key)) continue;
    const sanitized = sanitizeDesignProjectFieldValue(child, depth + 1);
    if (!isEmptySanitizedValue(sanitized)) safeEntries.push([key, sanitized]);
  }
  return Object.fromEntries(safeEntries);
}

function valueToText(value: unknown): string {
  const sanitized = sanitizeDesignProjectFieldValue(value);
  if (typeof sanitized === 'string') return sanitized;
  if (typeof sanitized === 'number' || typeof sanitized === 'boolean') return String(sanitized);
  if (Array.isArray(sanitized)) return sanitized.map(valueToText).filter(Boolean).join(' / ');
  const record = asRecord(sanitized);
  return record ? Object.values(record).map(valueToText).filter(Boolean).join(' / ') : '';
}

function readArrayField(fields: JsonRecord, name: string): string[] {
  const value = fields[name];
  if (Array.isArray(value)) return value.map(valueToText).filter(Boolean);
  const text = valueToText(value);
  return text ? [text] : [];
}

function attachmentCount(value: unknown): number {
  return Array.isArray(value) ? value.length : value ? 1 : 0;
}

function deriveRecord(fields: JsonRecord): DesignProjectDerivedRecord {
  const title = valueToText(fields['需求名称 - Requirement Description * 必填项']);
  const completed = Boolean(fields['是否完成 - Status']);
  return {
    title: title || '未命名需求',
    completed,
    status: completed ? '已完成' : '未完成',
    priority: valueToText(fields['优先级 - Priority * 必填项']) || '未设置',
    proposer: valueToText(fields['需求方 - Proposer']) || '未设置',
    supplier: valueToText(fields['交付 - Supplier']) || '未设置',
    assignee: valueToText(fields['指定对接设计']) || '未设置',
    department: valueToText(fields['需求部门']) || '未设置',
    channel: readArrayField(fields, '渠道 - Channel'),
    product: readArrayField(fields, '哪个产品 - Which Product？(可多选'),
    medium: readArrayField(fields, '媒介 - Media (可多选'),
    visualScale: valueToText(fields['视觉量级']) || '未设置',
    size: valueToText(fields['数字尺寸 - Size']),
    createdAt: valueToText(fields['创建时间']),
    deadline: valueToText(fields['交付时间 - Deadline * 必填项']),
    document: valueToText(fields['需求文档描述 - Link * 必填项']),
    background:
      valueToText(fields['项目背景与目标：为什么要这么设计？']) ||
      valueToText(fields['需求目标及背景 - 必填项*']),
    audience: valueToText(fields['目标受众与投放渠道：设计给谁看？在哪里看？']),
    successMetric: valueToText(fields['衡量成功的指标']),
    notice: valueToText(fields['备注 - Notice']),
    attachmentCount:
      attachmentCount(fields['需求附件 - Attachment']) +
      attachmentCount(fields['视觉参考 - Reference']) +
      attachmentCount(fields['交付文件 - Delivery documents']),
  };
}

function tally(
  records: DesignProjectSnapshotRecord[],
  getter: (record: DesignProjectSnapshotRecord) => string | string[],
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const record of records) {
    const value = getter(record);
    for (const item of Array.isArray(value) ? value : [value]) {
      const key = item || '未设置';
      result[key] = (result[key] ?? 0) + 1;
    }
  }
  return result;
}

function buildSummary(records: DesignProjectSnapshotRecord[]): DesignProjectsSnapshotSummary {
  const completedRecords = records.filter((record) => record.derived.completed).length;
  return {
    totalRecords: records.length,
    completedRecords,
    openRecords: records.length - completedRecords,
    byPriority: tally(records, (record) => record.derived.priority),
    byDepartment: tally(records, (record) => record.derived.department),
    byChannel: tally(records, (record) => record.derived.channel),
  };
}

function toSnapshotField(value: unknown): DesignProjectSnapshotField | null {
  const field = asRecord(value);
  if (!field) return null;
  const id = stringValue(field.id);
  const name = stringValue(field.name);
  if (!id || !name) return null;
  return {
    id,
    name,
    ...(stringValue(field.type) ? { type: stringValue(field.type) } : {}),
    ...(typeof field.multiple === 'boolean' ? { multiple: field.multiple } : {}),
    ...(field.options !== undefined ? { options: sanitizeDesignProjectFieldValue(field.options) } : {}),
    ...(field.style !== undefined ? { style: sanitizeDesignProjectFieldValue(field.style) } : {}),
    ...(stringValue(field.reason) ? { reason: stringValue(field.reason) } : {}),
  };
}

function metadataOf(snapshot: DesignProjectsSnapshot): DesignProjectsSnapshotMetadata {
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

function isSnapshotSummary(value: unknown): value is DesignProjectsSnapshotSummary {
  const summary = asRecord(value);
  return Boolean(
    summary &&
    typeof summary.totalRecords === 'number' &&
    typeof summary.completedRecords === 'number' &&
    typeof summary.openRecords === 'number' &&
    asRecord(summary.byPriority) &&
    asRecord(summary.byDepartment) &&
    asRecord(summary.byChannel),
  );
}

function parseStoredSnapshot(value: unknown): DesignProjectsSnapshot {
  const snapshot = asRecord(value);
  const source = asRecord(snapshot?.source);
  if (
    !snapshot ||
    snapshot.schemaVersion !== 1 ||
    !stringValue(snapshot.generatedBy) ||
    !stringValue(snapshot.syncedAt) ||
    !source ||
    !stringValue(source.title) ||
    typeof source.wikiUrl !== 'string' ||
    !stringValue(source.tableName) ||
    !Array.isArray(source.includedTables) ||
    !Array.isArray(source.excludedTables) ||
    !stringValue(source.syncMode) ||
    !Array.isArray(snapshot.fields) ||
    !Array.isArray(snapshot.records) ||
    !isSnapshotSummary(snapshot.summary)
  ) {
    throw new DesignProjectsServiceError(
      'DESIGN_PROJECTS_SNAPSHOT_INVALID',
      'The stored design project snapshot is invalid.',
    );
  }
  return value as DesignProjectsSnapshot;
}

async function writeSnapshotAtomically(
  filePath: string,
  snapshot: DesignProjectsSnapshot,
  limitBytes: number,
): Promise<void> {
  const body = `${JSON.stringify(snapshot, null, 2)}\n`;
  if (Buffer.byteLength(body) > limitBytes) throw snapshotSizeLimitError();
  await mkdir(dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
  try {
    await writeFile(tempPath, body, {
      encoding: 'utf8',
      mode: 0o600,
    });
    await rename(tempPath, filePath);
  } catch {
    await unlink(tempPath).catch(() => undefined);
    throw new DesignProjectsServiceError(
      'DESIGN_PROJECTS_SNAPSHOT_WRITE_FAILED',
      'Unable to save the refreshed design project snapshot.',
    );
  }
}

async function runLark(
  runner: DesignProjectsLarkCliRunner,
  args: readonly string[],
  stdin?: string,
): Promise<JsonRecord> {
  try {
    const result = asRecord(await runner.run(args, stdin));
    if (!result) throw new Error('invalid response');
    return result;
  } catch (error) {
    if (error instanceof DesignProjectsServiceError) throw error;
    throw new DesignProjectsServiceError(
      'DESIGN_PROJECTS_SYNC_FAILED',
      'Unable to refresh design projects from Feishu.',
    );
  }
}

async function buildSnapshot(
  runner: DesignProjectsLarkCliRunner,
  config: DesignProjectsConfig,
  now: () => Date,
  snapshotByteLimit: number,
): Promise<DesignProjectsSnapshot> {
  const syncStartedAt = Date.now();
  const snapshotBudget = createSnapshotSizeBudget(snapshotByteLimit);
  const assertWithinSyncDeadline = () => {
    if (Date.now() - syncStartedAt > MAX_SYNC_DURATION_MS) {
      throw new DesignProjectsServiceError(
        'DESIGN_PROJECTS_SYNC_FAILED',
        'Design project sync exceeded the 10 minute safety limit.',
      );
    }
  };
  assertWithinSyncDeadline();
  const nodeEnvelope = await runLark(runner, [
    'wiki', 'spaces', 'get_node', '--params', '-', '--format', 'json',
  ], JSON.stringify({ token: config.wikiToken }));
  const node = asRecord(asRecord(nodeEnvelope.data)?.node);
  if (stringValue(node?.obj_type) !== 'bitable' || !stringValue(node?.obj_token)) {
    throw new DesignProjectsServiceError(
      'DESIGN_PROJECTS_SYNC_FAILED',
      'The configured Feishu source is not a Base document.',
    );
  }
  const baseToken = stringValue(node?.obj_token);

  assertWithinSyncDeadline();
  const tableEnvelope = await runLark(runner, [
    'base', '+table-list', '--base-token', baseToken, '--offset', '0', '--limit', '100',
  ]);
  const tables = Array.isArray(asRecord(tableEnvelope.data)?.tables)
    ? asRecord(tableEnvelope.data)?.tables as unknown[]
    : [];
  const tableRecords = tables.map(asRecord).filter((table): table is JsonRecord => table != null);
  const selectedTable = tableRecords.find(
    (table) => stringValue(table.name) === config.tableName,
  );
  const tableId = stringValue(selectedTable?.id);
  if (!selectedTable || !tableId) {
    throw new DesignProjectsServiceError(
      'DESIGN_PROJECTS_SYNC_FAILED',
      `The configured design project table was not found: ${config.tableName}.`,
    );
  }

  assertWithinSyncDeadline();
  const fieldEnvelope = await runLark(runner, [
    'base', '+field-list', '--base-token', baseToken, '--table-id', tableId,
    '--offset', '0', '--limit', '200',
  ]);
  const rawFields = Array.isArray(asRecord(fieldEnvelope.data)?.fields)
    ? asRecord(fieldEnvelope.data)?.fields as unknown[]
    : [];
  const fields: DesignProjectSnapshotField[] = [];
  for (const rawField of rawFields) {
    const field = toSnapshotField(rawField);
    if (!field) continue;
    snapshotBudget.add(field);
    fields.push(field);
  }
  const fieldById = new Map(fields.map((field) => [field.id, field]));

  const records: DesignProjectSnapshotRecord[] = [];
  const ignoredFields = new Map<string, DesignProjectSnapshotField>();
  let offset = 0;
  let hasMore = true;
  let pageCount = 0;

  while (hasMore) {
    assertWithinSyncDeadline();
    pageCount += 1;
    if (pageCount > MAX_RECORD_PAGES) {
      throw new DesignProjectsServiceError(
        'DESIGN_PROJECTS_SYNC_FAILED',
        'Feishu pagination exceeded the design project sync limit.',
      );
    }
    const recordEnvelope = await runLark(runner, [
      'base', '+record-list', '--base-token', baseToken, '--table-id', tableId,
      '--offset', String(offset), '--limit', String(RECORD_PAGE_SIZE), '--format', 'json',
    ]);
    const page = asRecord(recordEnvelope.data) ?? {};
    const rows = Array.isArray(page.data) ? page.data : [];
    const fieldIds = stringArray(page.field_id_list);
    const fieldNames = stringArray(page.fields);
    const recordIds = stringArray(page.record_id_list);

    if (Array.isArray(page.ignored_fields)) {
      for (const rawIgnored of page.ignored_fields) {
        const ignored = toSnapshotField(rawIgnored);
        if (ignored) {
          snapshotBudget.add(ignored);
          ignoredFields.set(ignored.id || ignored.name, ignored);
        }
      }
    }

    rows.forEach((rawRow, rowIndex) => {
      if (!Array.isArray(rawRow)) return;
      const rawFieldsByName: JsonRecord = {};
      const fieldsByName: JsonRecord = {};
      fieldIds.forEach((fieldId, fieldIndex) => {
        const fieldName = fieldById.get(fieldId)?.name || fieldNames[fieldIndex] || fieldId;
        const value = rawRow[fieldIndex] ?? null;
        rawFieldsByName[fieldName] = value;
        fieldsByName[fieldName] = sanitizeDesignProjectFieldValue(value);
      });
      const recordId = recordIds[rowIndex] || `offset-${offset + rowIndex}`;
      const record: DesignProjectSnapshotRecord = {
        id: recordId,
        recordId,
        fields: fieldsByName,
        derived: deriveRecord(rawFieldsByName),
      };
      snapshotBudget.add(record);
      records.push(record);
      if (records.length > MAX_DESIGN_PROJECT_RECORDS) {
        throw new DesignProjectsServiceError(
          'DESIGN_PROJECTS_SYNC_FAILED',
          `Design project sync exceeded ${MAX_DESIGN_PROJECT_RECORDS} records.`,
        );
      }
    });

    hasMore = page.has_more === true;
    offset += rows.length || RECORD_PAGE_SIZE;
  }

  const tableName = stringValue(selectedTable.name) || config.tableName;
  const source = {
    title: stringValue(node?.title) || '设计项目需求提报系统',
    wikiUrl: config.publicWikiUrl,
    tableName,
    includedTables: [tableName],
    excludedTables: tableRecords
      .filter((table) => stringValue(table.id) !== tableId)
      .map((table) => stringValue(table.name))
      .filter(Boolean),
    syncMode: 'one-way-full-snapshot' as const,
  };
  const summary = buildSummary(records);
  snapshotBudget.add(source);
  snapshotBudget.add(summary);
  assertWithinSyncDeadline();
  return {
    schemaVersion: 1,
    generatedBy: 'open-design-daemon',
    syncedAt: now().toISOString(),
    source,
    fields,
    ignoredFields: [...ignoredFields.values()],
    records,
    summary,
  };
}

export function createDesignProjectsService(
  options: CreateDesignProjectsServiceOptions,
): DesignProjectsService {
  const env = options.env ?? process.env;
  const runner = options.runner ?? createDefaultDesignProjectsLarkCliRunner(env);
  const now = options.now ?? (() => new Date());
  const snapshotByteLimit = normalizedSnapshotByteLimit(options.snapshotByteLimit);
  const snapshotPath = join(options.dataDir, 'design-projects', SNAPSHOT_FILE_NAME);
  let syncInFlight: Promise<DesignProjectsSnapshot> | null = null;

  const readSnapshot = async (): Promise<DesignProjectsSnapshot | null> => {
    try {
      return parseStoredSnapshot(JSON.parse(await readFile(snapshotPath, 'utf8')) as unknown);
    } catch (error) {
      if (asRecord(error)?.code === 'ENOENT') return null;
      if (error instanceof DesignProjectsServiceError) throw error;
      throw new DesignProjectsServiceError(
        'DESIGN_PROJECTS_SNAPSHOT_INVALID',
        'The stored design project snapshot is invalid.',
      );
    }
  };

  const syncOnce = async (): Promise<DesignProjectsSnapshot> => {
    const config = readConfig(env);
    if (!config.wikiToken) {
      throw new DesignProjectsServiceError(
        'DESIGN_PROJECTS_NOT_CONFIGURED',
        'Design project sync is not configured.',
      );
    }
    if (!(await runner.isAvailable())) {
      throw new DesignProjectsServiceError(
        'DESIGN_PROJECTS_CLI_UNAVAILABLE',
        'The local Feishu CLI is unavailable.',
      );
    }
    const snapshot = await buildSnapshot(runner, config, now, snapshotByteLimit);
    await writeSnapshotAtomically(snapshotPath, snapshot, snapshotByteLimit);
    return snapshot;
  };

  return {
    snapshotPath,
    readSnapshot,
    async status() {
      const config = readConfig(env);
      const configured = Boolean(config.wikiToken);
      const cliAvailable = await runner.isAvailable();
      const snapshot = await readSnapshot();
      const reason = !configured ? 'missing-config' : !cliAvailable ? 'missing-cli' : undefined;
      return {
        canSync: configured && cliAvailable,
        configured,
        cliAvailable,
        ...(reason ? { reason } : {}),
        snapshot: snapshot ? metadataOf(snapshot) : null,
      };
    },
    sync() {
      if (syncInFlight) return syncInFlight;
      const promise = syncOnce().finally(() => {
        if (syncInFlight === promise) syncInFlight = null;
      });
      syncInFlight = promise;
      return promise;
    },
  };
}

export function designProjectsSnapshotMetadata(
  snapshot: DesignProjectsSnapshot,
): DesignProjectsSnapshotMetadata {
  return metadataOf(snapshot);
}
