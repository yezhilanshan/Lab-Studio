import type { RecordItem } from '../app/data';

export const BACKUP_VERSION = 2;

// Mirrors app/api/records/route.ts: kinds, isRecord, and the per-request body limits.
const KINDS = ['paper', 'scheme', 'experiment', 'sync', 'weekly', 'method', 'node', 'document', 'mindmap'];
const MAX_ITEMS = 500;
const MAX_CHARS = 2000000;

export type Backup = {
  version: number;
  exportedAt?: string;
  records: RecordItem[];
  scenes: Record<string, unknown>;
};

export function serializeBackup(records: RecordItem[], scenes: Record<string, unknown>) {
  return JSON.stringify({ version: BACKUP_VERSION, exportedAt: new Date().toISOString(), records, scenes }, null, 2);
}

function isRecord(x: unknown): x is RecordItem {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return false;
  const r = x as Record<string, unknown>;
  return typeof r.id === 'string' && r.id.length <= 150 && typeof r.kind === 'string' && KINDS.includes(r.kind) &&
    (Boolean(r.deleted) || (typeof r.title === 'string' && Boolean(r.title.trim()) && r.title.length <= 500)) &&
    Object.values(r).every(v => typeof v === 'string' || typeof v === 'boolean');
}

export function parseBackup(raw: string): Backup {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw Error('备份文件无法解析，请确认选择的是导出的 JSON 备份。');
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw Error('备份格式不正确。');
  const obj = data as Record<string, unknown>;
  if (obj.version !== 1 && obj.version !== BACKUP_VERSION) throw Error('备份版本不受支持，请使用本工作台导出的备份。');
  if (!Array.isArray(obj.records) || !obj.records.length) throw Error('备份里没有记录。');

  const seen = new Set<string>();
  const records: RecordItem[] = [];
  for (const item of obj.records) {
    if (!isRecord(item)) {
      const r = (item || {}) as Record<string, unknown>;
      if (typeof r.id !== 'string' || !r.id) throw Error('存在缺少 ID 的记录。');
      if (typeof r.kind !== 'string' || !KINDS.includes(r.kind)) throw Error(`记录「${r.id}」的类型不受支持。`);
      if (!r.deleted && (typeof r.title !== 'string' || !r.title.trim() || r.title.length > 500)) throw Error(`记录「${r.id}」的标题为空或过长。`);
      throw Error(`记录「${r.id}」含有非法字段，只允许文本与布尔值。`);
    }
    if (seen.has(item.id)) throw Error(`备份中存在重复记录「${item.id}」。`);
    seen.add(item.id);
    records.push(item);
  }

  const scenes: Record<string, unknown> = {};
  if (obj.scenes !== undefined) {
    if (!obj.scenes || typeof obj.scenes !== 'object' || Array.isArray(obj.scenes)) throw Error('备份中的画布数据格式不正确。');
    for (const [key, value] of Object.entries(obj.scenes)) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error(`画布「${key}」的内容格式不正确。`);
      scenes[key] = value;
    }
  }
  return { version: obj.version, exportedAt: typeof obj.exportedAt === 'string' ? obj.exportedAt : undefined, records, scenes };
}

// A JSON array body is exactly 1 + sum(item lengths) + item count characters.
function bodyLength(count: number, sum: number) {
  return count === 0 ? 2 : 1 + sum + count;
}

// The server validates treeSeed + saved + incoming on every node write, so a parent
// must reach the database no later than its children. Non-node records keep their slots.
export function orderRecordsForImport(records: RecordItem[]): RecordItem[] {
  const slots: number[] = [], nodes: RecordItem[] = [];
  records.forEach((record, index) => {
    if (record.kind === 'node') {
      slots.push(index);
      nodes.push(record);
    }
  });
  if (nodes.length < 2) return [...records];

  const byId = new Map(nodes.map(node => [node.id, node]));
  const children = new Map<string, string[]>();
  const pending = new Map<string, number>();
  for (const node of nodes) {
    const parent = String(node.parent || '');
    const linked = Boolean(parent) && byId.has(parent) && parent !== node.id;
    pending.set(node.id, linked ? 1 : 0);
    if (linked) children.set(parent, [...(children.get(parent) || []), node.id]);
  }

  const queue = nodes.filter(node => pending.get(node.id) === 0).map(node => node.id);
  const ordered: RecordItem[] = [];
  for (let head = 0; head < queue.length; head++) {
    const id = queue[head];
    ordered.push(byId.get(id)!);
    for (const child of children.get(id) || []) {
      const left = (pending.get(child) || 0) - 1;
      pending.set(child, left);
      if (left === 0) queue.push(child);
    }
  }
  // A cycle leaves nodes unqueued; keep them so the server can report it rather than silently dropping rows.
  if (ordered.length < nodes.length) {
    const done = new Set(ordered.map(node => node.id));
    ordered.push(...nodes.filter(node => !done.has(node.id)));
  }

  const result = [...records];
  slots.forEach((slot, index) => { result[slot] = ordered[index]; });
  return result;
}

export function chunkRecords(records: RecordItem[]): RecordItem[][] {
  const chunks: RecordItem[][] = [];
  let current: RecordItem[] = [], sum = 0;
  for (const record of records) {
    const size = JSON.stringify(record).length;
    if (bodyLength(1, size) > MAX_CHARS) throw Error(`记录「${record.title || record.id}」单条过大，无法提交；请先精简其正文。`);
    if (current.length && (current.length + 1 > MAX_ITEMS || bodyLength(current.length + 1, sum + size) > MAX_CHARS)) {
      chunks.push(current);
      current = [];
      sum = 0;
    }
    current.push(record);
    sum += size;
  }
  if (current.length) chunks.push(current);
  return chunks;
}