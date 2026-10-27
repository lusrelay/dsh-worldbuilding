/**
 * 世界观工坊 Host 半身。
 *
 * 职责：
 *  - 每个世界观一个独立 JSON 文件（worlds/<id>.json），互不干扰；
 *  - 统一的世界观 schema、排序、清洗、导入合并与导出格式化；
 *  - 通过 ctx.webServer 暴露本地 /worldbuilding/api（浏览器鉴权 + 本地文件存储，无外部服务）；
 *  - 通过 ctx.llm + agentDefaultModel 调用当前默认模型：一次性生成、对话补充、通用格式导入；
 *  - 向 Agent 注册 worldbuilding_* 工具，并在系统提示词里说明用法。
 */
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export const inject = ['connection', 'webServer'];

const BUILD = '1.1.1';
const SCHEMA = 'worldbuilding/2';
const API_PREFIX = '/worldbuilding';
const API_PATH = '/worldbuilding/api';
const API_BODY_LIMIT = 16 * 1024 * 1024;

const DSH_HOME = process.env.DSH_HOME && process.env.DSH_HOME.trim()
  ? process.env.DSH_HOME.trim()
  : join(homedir(), '.dsh');
const DATA_DIR = join(DSH_HOME, 'worldbuilding');
const WORLDS_DIR = join(DATA_DIR, 'worlds');
const MEDIA_DIR = join(DATA_DIR, 'media');
const INDEX_FILE = join(DATA_DIR, 'index.json');

const LIMITS = {
  name: 120,
  type: 100,
  style: 4000,
  era: 120,
  eraNote: 6000,
  summary: 12000,
  entryTitle: 200,
  entryContent: 20000,
  eventTime: 120,
  eventImpact: 4000,
  eventCount: 600,
  timelineCount: 120,
  compositionCount: 300,
  settingsCount: 300,
  markerCount: 240,
  chatCount: 160,
  chatText: 12000,
  importText: 80000,
  mapBytes: 6 * 1024 * 1024,
  characterCount: 200,
  characterName: 120,
  characterRole: 60,
  characterIdentity: 200,
  characterDescription: 8000,
  characterTimelineCount: 120,
  characterRelations: 40,
  characterRelated: 40,
  characterEventIds: 300,
  characterImageBytes: 2 * 1024 * 1024,
  worldJson: 6 * 1024 * 1024,
};

const ENTRY_TARGETS = {
  event: { prefix: 'ev', array: 'events' },
  timeline: { prefix: 'tl', array: 'timeline' },
  composition: { prefix: 'cp', array: 'composition' },
  setting: { prefix: 'se', array: 'settings' },
  marker: { prefix: 'mk', array: 'mapMarkers' },
};

const SCALAR_TARGETS = new Map([
  ['name', 'name'],
  ['type', 'type'],
  ['style', 'style'],
  ['era', 'era'],
  ['eranote', 'eraNote'],
  ['summary', 'summary'],
  ['mapnotes', 'mapNotes'],
]);

const TARGET_ALIAS = new Map([
  ['events', 'event'],
  ['timeline', 'timeline'],
  ['timelines', 'timeline'],
  ['composition', 'composition'],
  ['compositions', 'composition'],
  ['setting', 'setting'],
  ['settings', 'settings'],
  ['rules', 'setting'],
  ['mapmarker', 'marker'],
  ['mapmarkers', 'marker'],
  ['marker', 'marker'],
  ['markers', 'marker'],
  ['character', 'character'],
  ['characters', 'character'],
  ['npc', 'character'],
  ['role', 'character'],
  ['charactertimeline', 'charactertimeline'],
  ['charactertimelines', 'charactertimeline'],
  ['chractertimeline', 'charactertimeline'],
  ['characterrelation', 'characterrelation'],
  ['characterrelations', 'characterrelation'],
  ['relation', 'characterrelation'],
  ['relations', 'characterrelation'],
]);

class AppError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'WorldbuildingError';
    this.code = code;
    this.details = details;
  }
}

/* ----------------------------------------------------------------- 工具函数 */

function now() {
  return Date.now();
}

function newId(prefix) {
  return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

function cleanText(value, max) {
  if (typeof value !== 'string') {
    if (typeof value === 'number' || typeof value === 'boolean') value = String(value);
    else return '';
  }
  return value
    .replace(/\r\n/g, '\n')
    .replace(/\u0000/g, '')
    .slice(0, max)
    .trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function unique(list) {
  const seen = new Set();
  const out = [];
  for (const item of list) {
    if (!item || seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}

function validId(value, prefixes = null) {
  if (typeof value !== 'string' || !/^[a-z]{2,8}_[a-zA-Z0-9_-]{4,48}$/.test(value)) return '';
  if (!prefixes) return value;
  return prefixes.some((prefix) => value.startsWith(`${prefix}_`)) ? value : '';
}

function idOrNew(value, prefix) {
  return validId(value, [prefix]) || newId(prefix);
}

function boundedNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

/** 从时间文本中榨出一个可比较的年份；支持「纪元前 300 年」「-300」「1200 年」。 */
function parseYear(value) {
  const source = String(value ?? '').trim();
  if (!source) return null;
  const match = source.match(/(\d{1,6})/);
  if (!match) return null;
  let year = Number(match[1]);
  if (!Number.isFinite(year)) return null;
  const before = source.slice(0, match.index);
  if (/前|BC|BCE|公元前/i.test(before) || /^\s*-/.test(source)) year = -year;
  return year;
}

/** 重大事件按时间自动排序：能解析出年份的在前，年份相同按时间文本，其余按创建顺序。 */
function sortEvents(events) {
  return events
    .map((event, index) => ({ event, index, year: parseYear(event.time) }))
    .sort((left, right) => {
      const ly = left.year === null ? Number.POSITIVE_INFINITY : left.year;
      const ry = right.year === null ? Number.POSITIVE_INFINITY : right.year;
      if (ly !== ry) return ly - ry;
      if (left.year !== null && right.year !== null) {
        const byTime = String(left.event.time).localeCompare(String(right.event.time), 'zh');
        if (byTime !== 0) return byTime;
      }
      const lc = Number(left.event.createdAt) || 0;
      const rc = Number(right.event.createdAt) || 0;
      if (lc !== rc) return lc - rc;
      return left.index - right.index;
    })
    .map((item) => item.event);
}

function entryStamp(input, prefix, extra = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const stamp = now();
  return {
    id: idOrNew(source.id, prefix),
    ...extra,
    createdAt: Number.isFinite(Number(source.createdAt)) ? Number(source.createdAt) : stamp,
    updatedAt: stamp,
  };
}

function normalizeTimeline(input) {
  return asArray(input).slice(0, LIMITS.timelineCount).map((item) => {
    const source = item && typeof item === 'object' ? item : {};
    return entryStamp(source, 'tl', {
      name: cleanText(source.name ?? source.title ?? source.era, LIMITS.entryTitle) || '未命名时代',
      span: cleanText(source.span ?? source.time, LIMITS.eventTime),
      description: cleanText(source.description ?? source.content, LIMITS.entryContent),
    });
  });
}

function normalizeEvents(input) {
  const events = asArray(input).slice(0, LIMITS.eventCount).map((item) => {
    const source = item && typeof item === 'object' ? item : {};
    return entryStamp(source, 'ev', {
      time: cleanText(source.time ?? source.at ?? source.date, LIMITS.eventTime),
      title: cleanText(source.title ?? source.name, LIMITS.entryTitle) || '未命名事件',
      description: cleanText(source.description ?? source.content, LIMITS.entryContent),
      impact: cleanText(source.impact ?? source.consequence, LIMITS.eventImpact),
    });
  });
  return sortEvents(events);
}

function normalizeEntries(input, prefix, fallbackTitle) {
  return asArray(input).map((item) => {
    const source = item && typeof item === 'object' ? item : {};
    return entryStamp(source, prefix, {
      title: cleanText(source.title ?? source.name, LIMITS.entryTitle) || fallbackTitle,
      content: cleanText(source.content ?? source.description ?? source.text, LIMITS.entryContent),
    });
  });
}

function normalizeMarkers(input) {
  return asArray(input).slice(0, LIMITS.markerCount).map((item) => {
    const source = item && typeof item === 'object' ? item : {};
    let x = Number(source.x);
    let y = Number(source.y);
    if (Number.isFinite(x) && x > 1 && x <= 100) x /= 100;
    if (Number.isFinite(y) && y > 1 && y <= 100) y /= 100;
    return entryStamp(source, 'mk', {
      name: cleanText(source.name ?? source.title, LIMITS.entryTitle) || '未命名地点',
      x: boundedNumber(x, 0, 1, 0.5),
      y: boundedNumber(y, 0, 1, 0.5),
      note: cleanText(source.note ?? source.content, LIMITS.entryContent),
    });
  });
}

function normalizeChat(input) {
  return asArray(input).slice(-LIMITS.chatCount).map((item) => {
    const source = item && typeof item === 'object' ? item : {};
    const role = source.role === 'assistant' ? 'assistant' : 'user';
    return {
      id: validId(source.id, ['msg']) || newId('msg'),
      role,
      text: cleanText(source.text, LIMITS.chatText),
      at: Number.isFinite(Number(source.at)) ? Number(source.at) : now(),
      changes: asArray(source.changes).map((change) => cleanText(change, 300)).filter(Boolean).slice(0, 20),
    };
  }).filter((message) => message.text);
}

function imageName(value) {
  const name = cleanText(value, 80);
  return /^[a-z0-9][a-z0-9._-]*\.(png|jpe?g|webp|gif)$/i.test(name) ? name : '';
}

/* --------------------------------------------------------------- 角色模型 */

const RELATED_KINDS = new Set(['event', 'timeline', 'composition', 'setting', 'marker']);
const RELATED_PREFIX = { event: 'ev', timeline: 'tl', composition: 'cp', setting: 'se', marker: 'mk' };

function sortCharacterPoints(points) {
  return points
    .map((point, index) => ({ point, index, year: parseYear(point.time) }))
    .sort((left, right) => {
      const ly = left.year === null ? Number.POSITIVE_INFINITY : left.year;
      const ry = right.year === null ? Number.POSITIVE_INFINITY : right.year;
      if (ly !== ry) return ly - ry;
      const lc = Number(left.point.createdAt) || 0;
      const rc = Number(right.point.createdAt) || 0;
      if (lc !== rc) return lc - rc;
      return left.index - right.index;
    })
    .map((item) => item.point);
}

function normalizeCharacterTimeline(input) {
  const points = asArray(input).slice(0, LIMITS.characterTimelineCount).map((item) => {
    const source = item && typeof item === 'object' ? item : {};
    const stamp = now();
    return {
      id: idOrNew(source.id, 'tp'),
      time: cleanText(source.time ?? source.at ?? source.date, LIMITS.eventTime),
      title: cleanText(source.title ?? source.name, LIMITS.entryTitle) || '未命名时间点',
      description: cleanText(source.description ?? source.content, LIMITS.entryContent),
      eventId: validId(source.eventId, ['ev']),
      source: ['manual', 'auto', 'ai'].includes(source.source) ? source.source : 'manual',
      createdAt: Number.isFinite(Number(source.createdAt)) ? Number(source.createdAt) : stamp,
      updatedAt: stamp,
    };
  });
  return sortCharacterPoints(points);
}

function normalizeRelatedEntries(input) {
  const seen = new Set();
  const out = [];
  for (const item of asArray(input).slice(0, LIMITS.characterRelated)) {
    const source = item && typeof item === 'object' ? item : {};
    const kind = cleanText(source.kind ?? source.type, 20).toLowerCase();
    if (!RELATED_KINDS.has(kind)) continue;
    const id = validId(source.id, [RELATED_PREFIX[kind]]);
    if (!id) continue;
    const key = `${kind}:${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      kind,
      id,
      label: cleanText(source.label ?? source.title ?? source.name, 200),
    });
  }
  return out;
}

function normalizeRelations(input) {
  const seen = new Set();
  const out = [];
  for (const item of asArray(input).slice(0, LIMITS.characterRelations)) {
    const source = item && typeof item === 'object' ? item : {};
    const rawTarget = source.targetId || source.target || source.targetName || source.characterId || '';
    const targetId = validId(rawTarget, ['ch']);
    const targetName = targetId ? '' : cleanText(rawTarget, LIMITS.characterName);
    const type = cleanText(source.type ?? source.relation ?? source.kind, 40) || '其他';
    const key = `${targetId || targetName}|${type}`;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: idOrNew(source.id, 'rel'),
      targetId,
      targetName,
      type,
      note: cleanText(source.note ?? source.description, 800),
      createdAt: now(),
      updatedAt: now(),
    });
  }
  return out;
}

function normalizeCharacters(input) {
  return asArray(input).slice(0, LIMITS.characterCount).map((item) => {
    const source = item && typeof item === 'object' ? item : {};
    const species = cleanText(source.species, 80);
    const role = cleanText(source.role ?? source.type, LIMITS.characterRole) || '重要角色';
    const nonHuman = Boolean(source.nonHuman)
      || Boolean(species && !/^(人类|人族|human|humanoid)$/i.test(species));
    const npc = Boolean(source.npc) || /NPC|剧情/i.test(role);
    return entryStamp(source, 'ch', {
      name: cleanText(source.name, LIMITS.characterName) || '未命名角色',
      role,
      identity: cleanText(source.identity ?? source.title, LIMITS.characterIdentity),
      species,
      nonHuman,
      npc,
      description: cleanText(source.description ?? source.summary ?? source.content, LIMITS.characterDescription),
      image: imageName(source.image),
      relatedEntries: normalizeRelatedEntries(source.relatedEntries ?? source.related),
      timeline: normalizeCharacterTimeline(source.timeline ?? source.points),
      eventIds: unique(asArray(source.eventIds).map((id) => validId(id, ['ev'])).filter(Boolean)).slice(0, LIMITS.characterEventIds),
      relations: normalizeRelations(source.relations ?? source.relationships),
    });
  });
}

/** 角色关系可能用姓名表达；在世界完整后把姓名/ID 统一解析成稳定 id，并丢弃失效引用。 */
function resolveCharacterLinks(world) {
  const characters = asArray(world.characters);
  const byName = new Map();
  for (const character of characters) {
    if (!byName.has(character.name)) byName.set(character.name, character);
  }
  const eventIds = new Set(world.events.map((event) => event.id));
  const sectionRefs = new Map();
  for (const event of world.events) sectionRefs.set(`event:${event.id}`, event.title);
  for (const era of world.timeline) sectionRefs.set(`timeline:${era.id}`, era.name);
  for (const item of world.composition) sectionRefs.set(`composition:${item.id}`, item.title);
  for (const item of world.settings) sectionRefs.set(`setting:${item.id}`, item.title);
  for (const marker of world.map.markers) sectionRefs.set(`marker:${marker.id}`, marker.name);

  for (const character of characters) {
    character.eventIds = unique(character.eventIds).filter((id) => eventIds.has(id)).slice(0, LIMITS.characterEventIds);
    character.timeline = normalizeCharacterTimeline(character.timeline).map((point) => ({
      ...point,
      eventId: eventIds.has(point.eventId) ? point.eventId : '',
    }));
    character.relatedEntries = character.relatedEntries
      .map((ref) => {
        const label = sectionRefs.get(`${ref.kind}:${ref.id}`);
        return label ? { ...ref, label } : null;
      })
      .filter(Boolean)
      .slice(0, LIMITS.characterRelated);
    const resolved = [];
    const seen = new Set();
    for (const relation of character.relations) {
      let targetId = relation.targetId;
      if (!targetId && relation.targetName) targetId = byName.get(relation.targetName)?.id || '';
      if (!targetId || targetId === character.id) continue;
      const key = `${targetId}|${relation.type}`;
      if (seen.has(key)) continue;
      seen.add(key);
      resolved.push({ ...relation, targetId, targetName: undefined });
    }
    character.relations = resolved.slice(0, LIMITS.characterRelations);
  }
  return world;
}

/** 把一个来源对象清洗成完整世界观；所有入口共用，保证落盘格式一致。 */
function normalizeWorld(input, options = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const stamp = now();
  const baseId = options.id || validId(source.id, ['w']) || newId('w');
  const createdAt = Number.isFinite(Number(options.createdAt))
    ? Number(options.createdAt)
    : Number.isFinite(Number(source.createdAt)) ? Number(source.createdAt) : stamp;

  const world = {
    schema: SCHEMA,
    id: baseId,
    name: cleanText(source.name, LIMITS.name) || cleanText(options.fallbackName, LIMITS.name) || '未命名世界观',
    type: cleanText(source.type, LIMITS.type),
    style: cleanText(source.style, LIMITS.style),
    era: cleanText(source.era, LIMITS.era),
    eraNote: cleanText(source.eraNote, LIMITS.eraNote),
    summary: cleanText(source.summary, LIMITS.summary),
    tags: unique(asArray(source.tags).map((tag) => cleanText(tag, 24)).filter(Boolean)).slice(0, 12),
    timeline: normalizeTimeline(source.timeline),
    events: normalizeEvents(source.events),
    composition: normalizeEntries(source.composition, 'cp', '未命名构成').slice(0, LIMITS.compositionCount),
    settings: normalizeEntries(source.settings, 'se', '未命名设定').slice(0, LIMITS.settingsCount),
    map: {
      image: imageName(source.map?.image),
      notes: cleanText(source.map?.notes, LIMITS.entryContent),
      markers: normalizeMarkers(source.map?.markers),
    },
    characters: normalizeCharacters(source.characters),
    aiChat: normalizeChat(options.aiChat ?? source.aiChat),
    createdAt,
    updatedAt: Number.isFinite(Number(source.updatedAt)) ? Number(source.updatedAt) : stamp,
    rev: boundedNumber(source.rev, 0, Number.MAX_SAFE_INTEGER, 0),
  };
  world.events = sortEvents(world.events);
  resolveCharacterLinks(world);
  return world;
}

function emptyWorld(name) {
  return normalizeWorld({ name, type: '', style: '', era: '', summary: '' }, { fallbackName: name });
}

function countsOf(world) {
  return {
    events: world.events.length,
    timeline: world.timeline.length,
    composition: world.composition.length,
    settings: world.settings.length,
    markers: world.map.markers.length,
    characters: world.characters.length,
    words: [
      world.summary, world.style, world.eraNote,
      ...world.events.map((item) => `${item.description}${item.impact}`),
      ...world.timeline.map((item) => item.description),
      ...world.composition.map((item) => item.content),
      ...world.settings.map((item) => item.content),
      ...world.characters.map((item) => `${item.description}${item.identity}${item.timeline.map((point) => point.description).join('')}`),
      world.map.notes,
    ].join('').replace(/\s/g, '').length,
  };
}

function completenessOf(world) {
  const checks = [
    Boolean(world.name && world.name !== '未命名世界观'),
    Boolean(world.type),
    Boolean(world.era),
    world.timeline.length > 0,
    world.events.length > 0,
    world.composition.length > 0,
    world.settings.length > 0,
    Boolean(world.map.notes || world.map.image || world.map.markers.length),
    world.characters.length > 0,
    world.characters.some((character) => character.relations.length > 0 || character.timeline.length > 0 || character.eventIds.length > 0),
    Boolean(world.summary),
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

function summaryOf(world) {
  return {
    id: world.id,
    name: world.name,
    type: world.type,
    era: world.era,
    updatedAt: world.updatedAt,
    createdAt: world.createdAt,
    counts: countsOf(world),
    completeness: completenessOf(world),
  };
}

/* --------------------------------------------------------------------- 存储 */

const queues = new Map();

function withLock(key, task) {
  const previous = queues.get(key) ?? Promise.resolve();
  const run = previous.then(task, task);
  const settled = run.catch(() => {});
  queues.set(key, settled);
  return run.finally(() => {
    if (queues.get(key) === settled) queues.delete(key);
  });
}

async function ensureDirs() {
  await mkdir(WORLDS_DIR, { recursive: true });
  await mkdir(MEDIA_DIR, { recursive: true });
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    if (error && error.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function writeAtomic(file, value) {
  await mkdir(dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${now()}.${Math.random().toString(16).slice(2, 8)}.tmp`;
  await writeFile(temp, JSON.stringify(value, null, 2), 'utf8');
  await rename(temp, file);
}

function worldFile(id) {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(String(id))) throw new AppError('worldbuilding/bad-id', '世界观 id 不合法');
  return join(WORLDS_DIR, `${id}.json`);
}

function characterImageDir(worldId) {
  return join(MEDIA_DIR, worldId, 'characters');
}

async function characterImageFiles(worldId, characterId) {
  try {
    const files = await readdir(characterImageDir(worldId));
    return files.filter((name) => name.startsWith(`${characterId}.`) || name.startsWith(`${characterId}-`));
  } catch {
    return [];
  }
}

async function removeCharacterFiles(worldId, characterId) {
  const dir = characterImageDir(worldId);
  for (const name of await characterImageFiles(worldId, characterId)) {
    await unlink(join(dir, name)).catch(() => {});
  }
}

async function readCharacterImage(worldId, imageNameValue) {
  const name = imageName(imageNameValue);
  if (!name) return '';
  try {
    const bytes = await readFile(join(characterImageDir(worldId), name));
    const extension = name.split('.').pop()?.toLowerCase() ?? 'png';
    const mime = extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg' : `image/${extension}`;
    return `data:${mime};base64,${bytes.toString('base64')}`;
  } catch {
    return '';
  }
}

/** 保存后清理被删除角色的图片，以及被替换/清空的旧图；未关联的孤儿文件保留，避免误删刚上传的草稿。 */
async function cleanupCharacterImages(worldId, existing, next) {
  const dir = characterImageDir(worldId);
  for (const old of existing.characters) {
    const current = next.characters.find((character) => character.id === old.id);
    if (!current) {
      await removeCharacterFiles(worldId, old.id);
      continue;
    }
    if (old.image && old.image !== current.image) {
      await unlink(join(dir, old.image)).catch(() => {});
    }
  }
}

function normalizeIndex(input) {
  const source = input && typeof input === 'object' ? input : {};
  const order = unique(asArray(source.order).map((id) => String(id)).filter((id) => /^[a-zA-Z0-9_-]{1,80}$/.test(id)));
  const activeId = order.includes(source.activeId) ? source.activeId : order[0] ?? null;
  return { schema: 'worldbuilding-index/1', order, activeId, updatedAt: now() };
}

async function loadIndex() {
  return normalizeIndex(await readJson(INDEX_FILE, { order: [], activeId: null }));
}

async function saveIndex(index) {
  await ensureDirs();
  await writeAtomic(INDEX_FILE, { ...index, updatedAt: now() });
}

async function readWorldById(id) {
  const raw = await readJson(worldFile(id), null);
  if (!raw || typeof raw !== 'object') return null;
  const world = normalizeWorld(raw, { id });
  world.rev = boundedNumber(raw.rev, 0, Number.MAX_SAFE_INTEGER, 0);
  return world;
}

async function requireWorld(id) {
  const world = await readWorldById(id);
  if (!world) throw new AppError('worldbuilding/not-found', '找不到这个世界观，可能已被删除', { id });
  return world;
}

async function writeWorld(world) {
  const payload = JSON.stringify(world);
  if (Buffer.byteLength(payload, 'utf8') > LIMITS.worldJson) {
    throw new AppError('worldbuilding/too-large', '世界观内容过大（超过 4MB），请拆分或精简后再保存');
  }
  await writeAtomic(worldFile(world.id), world);
}

async function resolveWorldRef(ref) {
  if (typeof ref === 'string' && ref.trim()) {
    const value = ref.trim();
    if (/^[a-zA-Z0-9_-]{4,80}$/.test(value)) {
      const direct = await readWorldById(value).catch(() => null);
      if (direct) return direct;
    }
    const index = await loadIndex();
    for (const id of index.order) {
      const world = await readWorldById(id);
      if (world && world.name === value) return world;
    }
    throw new AppError('worldbuilding/not-found', `找不到世界观「${value}」`, { ref: value });
  }
  const index = await loadIndex();
  if (!index.activeId) throw new AppError('worldbuilding/no-world', '还没有任何世界观，请先新建一个');
  return requireWorld(index.activeId);
}

/** 新建并插入索引；返回落盘后的世界。 */
async function insertWorld(world) {
  await ensureDirs();
  return withLock('index', async () => {
    const index = await loadIndex();
    const next = normalizeWorld(world, { id: world.id });
    next.rev = 1;
    next.createdAt = next.createdAt || now();
    next.updatedAt = now();
    await writeWorld(next);
    index.order = unique([next.id, ...index.order]);
    index.activeId = next.id;
    await saveIndex(index);
    cacheFromWorld(next);
    return next;
  });
}

async function listWorldSummaries() {
  const index = await loadIndex();
  let files = [];
  try {
    files = (await readdir(WORLDS_DIR)).filter((name) => name.endsWith('.json')).map((name) => name.slice(0, -5));
  } catch {
    files = [];
  }
  const ids = unique([...index.order, ...files]);
  const worlds = [];
  for (const id of ids) {
    const world = await readWorldById(id).catch(() => null);
    if (world) worlds.push(summaryOf(world));
  }
  return { index: { ...index, order: worlds.map((world) => world.id) }, worlds };
}

async function getState() {
  const { index, worlds } = await listWorldSummaries();
  return { worlds, activeId: index.activeId, build: BUILD, dataDir: DATA_DIR };
}

/* ------------------------------------------------------------------- 模型 */

class ModelError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'ModelError';
    this.code = code;
    this.details = details;
  }
}

function selectionOf(ctx) {
  const selection = ctx.get('agentDefaultModel')?.currentSelection?.();
  const provider = selection?.provider;
  const model = selection?.model;
  if (typeof provider !== 'string' || !provider || typeof model !== 'string' || !model) {
    throw new ModelError('worldbuilding/no-model', '还没有选择默认模型，请先在「设置 → 模型」里选择一个模型');
  }
  return { provider, model };
}

async function runModel(ctx, options) {
  const llm = ctx.get('llm');
  if (!llm || typeof llm.stream !== 'function') {
    throw new ModelError('worldbuilding/no-llm', '当前 Profile 没有加载 llm 服务，无法调用 AI');
  }
  const { provider, model } = selectionOf(ctx);
  const controller = new AbortController();
  const external = options.signal;
  let attached = false;
  const onAbort = () => controller.abort();
  if (external) {
    if (external.aborted) controller.abort();
    else external.addEventListener('abort', onAbort, { once: true });
    attached = true;
  }
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 240000);
  timer.unref?.();

  let text = '';
  let finish = null;
  let usage = null;
  try {
    const stream = llm.stream({
      provider,
      model,
      system: options.system,
      messages: [{ role: 'user', content: [{ type: 'text', text: options.prompt }] }],
      maxTokens: options.maxTokens ?? 8192,
      temperature: options.temperature ?? 0.8,
      signal: controller.signal,
    });
    for await (const chunk of stream) {
      if (!chunk || typeof chunk !== 'object') continue;
      if (chunk.type === 'text-delta') {
        text += chunk.text;
        options.onDelta?.(chunk.text);
      } else if (chunk.type === 'usage') {
        usage = chunk.usage;
      } else if (chunk.type === 'finish') {
        finish = chunk.reason;
      }
    }
  } catch (error) {
    if (controller.signal.aborted) {
      throw new ModelError('worldbuilding/aborted', external?.aborted ? '已取消' : '模型调用超时，请重试或把范围缩小一些');
    }
    throw new ModelError('worldbuilding/llm-failed', `模型调用失败：${error?.message || String(error)}`);
  } finally {
    clearTimeout(timer);
    if (attached && external) external.removeEventListener('abort', onAbort);
  }

  if (finish && (finish.kind === 'error' || finish.kind === 'aborted')) {
    if (external?.aborted) throw new ModelError('worldbuilding/aborted', '已取消');
    throw new ModelError('worldbuilding/llm-failed', `模型调用失败：${finish.failure?.message || finish.kind}`);
  }
  if (!text.trim()) {
    if (finish?.kind === 'max-tokens') {
      throw new ModelError('worldbuilding/truncated', '模型的输出额度被思考内容耗尽，没有留下正文。请重试，或把要求写得更短一些');
    }
    throw new ModelError('worldbuilding/empty', '模型没有返回内容，请重试');
  }
  return { text: text.trim(), finish: finish?.kind ?? 'stop', usage };
}

/** 从模型回复中取出 JSON；容忍代码围栏、前后解释与截断的结尾。 */
function parseModelJson(raw, label) {
  let source = String(raw ?? '').trim();
  if (!source) throw new ModelError('worldbuilding/empty-json', `${label}：模型没有返回内容`);
  source = source.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
  const start = source.indexOf('{');
  if (start < 0) {
    throw new ModelError('worldbuilding/bad-json', `${label}：模型回复里没有 JSON 对象`, { preview: source.slice(0, 240) });
  }
  let candidate = source.slice(start);
  const last = candidate.lastIndexOf('}');
  if (last >= 0) candidate = candidate.slice(0, last + 1);
  const attempts = [
    candidate,
    candidate.replace(/,\s*([}\]])/g, '$1'),
    repairTruncatedJson(candidate),
  ];
  for (const attempt of attempts) {
    if (!attempt) continue;
    try {
      const value = JSON.parse(attempt);
      if (value && typeof value === 'object' && !Array.isArray(value)) return value;
    } catch {
      /* 尝试下一种修复 */
    }
  }
  throw new ModelError('worldbuilding/bad-json', `${label}：模型没有按格式返回 JSON，请重试`, {
    preview: candidate.slice(0, 300),
  });
}

function repairTruncatedJson(source) {
  let text = source.trim();
  if (!text.startsWith('{')) return '';
  let inString = false;
  let escaped = false;
  const stack = [];
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{' || char === '[') stack.push(char);
    else if (char === '}' || char === ']') stack.pop();
  }
  if (inString) text += '"';
  text = text.replace(/,\s*$/, '');
  for (let index = stack.length - 1; index >= 0; index -= 1) {
    text += stack[index] === '{' ? '}' : ']';
  }
  return text;
}

/** 给模型的紧凑世界观数据；超出预算时按条目截断，而不是切断非法 JSON。 */
function compactWorld(world, budget = 18000) {
  const make = (contentLimit, countLimit) => ({
    name: world.name,
    type: world.type,
    style: cut(world.style, contentLimit),
    era: world.era,
    eraNote: cut(world.eraNote, contentLimit),
    summary: cut(world.summary, contentLimit),
    tags: world.tags,
    timeline: world.timeline.slice(0, countLimit).map((item) => ({
      id: item.id, name: item.name, span: item.span, description: cut(item.description, contentLimit),
    })),
    events: world.events.slice(0, countLimit).map((item) => ({
      id: item.id, time: item.time, title: item.title,
      description: cut(item.description, contentLimit), impact: cut(item.impact, contentLimit),
    })),
    composition: world.composition.slice(0, countLimit).map((item) => ({
      id: item.id, title: item.title, content: cut(item.content, contentLimit),
    })),
    settings: world.settings.slice(0, countLimit).map((item) => ({
      id: item.id, title: item.title, content: cut(item.content, contentLimit),
    })),
    characters: world.characters.slice(0, countLimit).map((character) => ({
      id: character.id,
      name: character.name,
      role: character.role,
      identity: character.identity,
      species: character.species,
      nonHuman: character.nonHuman,
      npc: character.npc,
      description: cut(character.description, contentLimit),
      eventIds: character.eventIds.slice(0, 16),
      relatedEntries: character.relatedEntries.slice(0, 8).map((ref) => `${ref.kind}:${ref.label}`),
      timeline: character.timeline.slice(0, 10).map((point) => ({
        id: point.id, time: point.time, title: point.title,
        description: cut(point.description, contentLimit), eventId: point.eventId,
      })),
      relations: character.relations.slice(0, 12).map((relation) => ({
        targetId: relation.targetId, type: relation.type, note: cut(relation.note, Math.min(500, contentLimit)),
      })),
    })),
    map: {
      notes: cut(world.map.notes, contentLimit),
      markers: world.map.markers.slice(0, Math.min(40, countLimit)).map((marker) => ({
        id: marker.id, name: marker.name, x: marker.x, y: marker.y, note: cut(marker.note, contentLimit),
      })),
    },
  });
  for (const [contentLimit, countLimit] of [[2400, 80], [1200, 60], [700, 40], [380, 24], [220, 16]]) {
    const text = JSON.stringify(make(contentLimit, countLimit));
    if (text.length <= budget) return text;
  }
  return JSON.stringify(make(160, 12));
}

function cut(value, max) {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

const SCHEMA_GUIDE = `{
  "name": "世界观名称",
  "type": "世界类型（如：高魔奇幻 / 低魔奇幻 / 科幻 / 赛博朋克 / 末日废土 / 东方仙侠 / 克苏鲁 / 蒸汽朋克 / 历史架空 / 其他）",
  "style": "风格说明：叙事基调、审美、语言质感、可以引用哪些意象，以及要避免什么",
  "summary": "世界观总览，2-4 段",
  "era": "当前时代名称",
  "eraNote": "当前时代的说明：技术/力量水平、社会状态、正在发生的大事",
  "timeline": [{"name": "时代名称", "span": "时间跨度", "description": "这个时代的特征与转折"}],
  "events": [{"time": "世界内时间（写法要能比较先后，例如：第三纪元 1200 年 / 纪元前 300 年）", "title": "事件名", "description": "发生了什么、牵涉谁", "impact": "对世界造成的长期影响"}],
  "composition": [{"title": "构成项（地理/势力/族群/经济/军事/宗教/魔法体系/日常生活…）", "content": "具体内容"}],
  "settings": [{"title": "规则名（世界规则/力量体系/物理法则/社会法则/禁忌…）", "content": "规则内容与边界"}],
  "characters": [{"name": "角色姓名", "role": "主角/重要配角/反派/剧情NPC/导师/关键路人/其他", "identity": "在世界中的身份、职位或称号", "species": "非人类角色的物种，人类可留空", "nonHuman": false, "npc": false, "description": "外貌、性格、动机、能力、秘密、说话方式；与哪些事件/势力有关", "timeline": [{"time": "角色经历的时间", "title": "发生了什么", "description": "细节", "eventId": "可选：关联的重大事件 id"}], "eventIds": ["可选：参与的重大事件 id"], "relations": [{"target": "另一角色的姓名（生成时）或 id（更新时）", "type": "盟友/敌对/亲属/师徒/恋人/上下级/竞争/其他", "note": "关系的具体内容与张力"}], "relatedEntries": [{"kind": "event/timeline/composition/setting/marker", "id": "已有条目 id", "label": "条目名称"}]}],
  "map": {"notes": "地理格局：大陆、海洋、气候、边境、关键地点", "markers": [{"name": "地点名", "x": 0.5, "y": 0.5, "note": "地点说明"}]},
  "tags": ["标签"]
}`;

const GENERATE_SYSTEM = `你是一位资深世界观设定师，擅长把一句模糊的想法扩展成自洽、可写、有张力的世界。你只输出一个 JSON 对象，不输出 Markdown、代码围栏或任何解释。

硬性要求：
1. 世界类型决定整体风格：高魔奇幻要解释魔法如何塑造社会；科幻要解释技术与制度的关系；末日要解释秩序如何崩塌与重建；仙侠要有修行资源与门派的现实逻辑。不要写成一个只有名词堆砌的设定集。
2. 所有设定必须互相咬合：地理影响经济，经济影响势力，势力影响事件，事件影响当前时代。至少写出 3 条这样的因果链。
3. timeline 写 4-6 个时代，按时间升序；events 写 12-18 个重大事件，必须按世界内时间升序，事件之间要有因果与后果。
4. composition 写 8-12 项，覆盖地理、势力、族群、经济、军事、宗教或技术/力量体系、普通人的日常生活。
5. settings 写 6-10 条世界规则，必须有边界与代价，不能是「什么都能做到」。
6. map.notes 写清楚大陆与海洋的格局、气候、边境和 5 个以上关键地点；markers 可以留空，也可以给 3-8 个地点（x/y 为 0-1 的相对坐标）。
7. characters 写 6-10 个重要角色，其中至少 1-2 个是剧情 NPC；至少 2 个角色与当前时代的核心矛盾直接相关。每个角色要有 role、identity、description，并给出 1-3 个 timeline 时间点；非人类角色必须写 species 并把 nonHuman 设为 true。
8. characters.relations 用角色的「姓名」指向另一个角色（生成阶段没有 id），写清关系类型与张力；至少 4 条关系，形成一张可读的关系网。角色时间线与重大事件、时代转折要能对上。
9. summary 用 2-4 段写清楚：这个世界是什么、最核心的矛盾是什么、普通人怎么活、故事可以从哪里开始。
10. style 写清叙事基调与语言质感，并明确要避免的俗套。
11. 中文输出；专有名词要统一，不要中英混杂。不要出现真实国家、真实人物或现实宗教的贬损性描写。
12. 不要输出 JSON 之外的任何字符。`;

const FILL_RULES = `这是「补全」任务：用户已经写了部分内容。你只能补空缺与明显过薄的部分，不能改写或删除已有内容，不能改变已有的专有名词。
- 已有字段非空时保持原样；已有条目不要重复添加；可以新增缺失的条目，但新条目必须与已有设定兼容。
- 输出仍然是完整 JSON（用于合并），不是补丁。`;

const OVERWRITE_RULES = `这是「重写」任务：以用户的新要求为准，重写内容字段；保留世界观的名称与结构，不要输出无关解释。`;

const IMPORT_SYSTEM = `你是一位世界观资料整理师。用户会给你一段任意格式的世界观资料（可能是 JSON、Markdown、设定文档、聊天记录、表格或散文）。你要识别其中的信息，整理成一个统一的世界观 JSON 对象，只输出 JSON，不输出任何解释。

整理规则：
1. 原资料里的事实优先。不要为了凑结构编造与原文冲突的内容；原文没有的字段用空字符串或空数组。
2. 把散落的信息归位：地理/势力/族群/经济/军事/宗教/技术体系放进 composition；规则/法则/禁忌放进 settings；历史大事放进 events；时代划分放进 timeline；角色与 NPC 放进 characters；一句话总览放进 summary。
3. 时间线要尽量还原原文的时间写法；能判断先后的事件按时间升序排列。原文没有明确时间的，按叙述顺序估算，并在 time 里写「约 …」。
4. 合并重复条目；同一势力/地点只保留一条，把细节合并进 content。
5. 角色要保留原文的姓名、身份、物种与关系；关系对象可以用姓名表示，导入后会自动解析成角色 id。角色经历放进 timeline，参与的重大事件放进 eventIds（如果原文能对应到 events 的 id）。
6. 保留原文的专有名词与语言；如果原文是外文，专有名词保留原文，说明文字可以翻译成中文。
7. 输出必须是完整 JSON，字段结构如下：
${SCHEMA_GUIDE}`;

const CHAT_SYSTEM = `你是「世界观工坊」的设定助手。用户正在通过对话补充一个已经存在的世界观。你要根据当前世界观数据与用户的这句话，决定需要新增或修改哪些内容，并输出一个 JSON 对象。

输出格式：
{
  "reply": "给用户看的中文回复，1-3 句，说明你做了什么；如果只是回答问题，changes 为空数组",
  "changes": [
    {"target": "name|type|style|era|eraNote|summary|mapNotes", "action": "set", "text": "新内容"},
    {"target": "event|timeline|composition|setting|marker", "action": "add", "data": {"title": "...", "content": "...", "time": "...", "description": "...", "impact": "...", "name": "...", "span": "...", "note": "...", "x": 0.5, "y": 0.5}},
    {"target": "event|timeline|composition|setting|marker", "action": "update", "id": "已有条目的 id", "data": {"需要改的字段": "新值"}},
    {"target": "event|timeline|composition|setting|marker", "action": "remove", "id": "已有条目的 id"},
    {"target": "character", "action": "add", "data": {"name": "姓名", "role": "主角/重要配角/反派/剧情NPC/其他", "identity": "身份", "species": "非人类物种，可留空", "nonHuman": false, "npc": false, "description": "外貌/性格/动机/秘密", "timeline": [{"time": "时间", "title": "经历", "description": "细节"}], "relations": [{"target": "另一角色的姓名或 id", "type": "盟友/敌对/亲属/师徒/恋人/上下级/竞争/其他", "note": "关系张力"}]}},
    {"target": "character", "action": "update", "id": "已有角色 id", "data": {"需要改的字段": "新值"}},
    {"target": "characterTimeline", "action": "add", "data": {"characterId": "ch_x", "time": "时间", "title": "经历", "description": "细节", "eventId": "可选的事件 id"}},
    {"target": "characterRelation", "action": "add", "data": {"fromId": "ch_x", "target": "ch_y 或另一角色姓名", "type": "盟友", "note": "关系张力"}}
  ]
}

规则：
1. 只输出 JSON，不要代码围栏或解释。
2. 现有内容默认保留。除非用户明确要求删除或改写，否则只做增量补充。
3. update/remove 必须使用当前数据里真实存在的 id，不能编造 id；新增条目不要带 id。角色关系可以用姓名指向另一个已有角色，系统会自动解析成 id。
4. target 为 event 时 data 用 time/title/description/impact；timeline 用 name/span/description；composition 和 setting 用 title/content；marker 用 name/x/y/note（x/y 为 0-1）。
5. target 为 character 时 data 用 name/role/identity/species/nonHuman/npc/description，可选 timeline/relations/eventIds/relatedEntries；新增角色必须写 name。
6. 用户问的是问题时，changes 返回空数组，在 reply 里直接回答。
7. 回复使用用户的语言；设定内容保持世界观原语言。
8. 一次最多 12 条 changes；如果用户要求大改，优先补齐最关键的几个部分并告诉用户还可以继续。`;

const AI_TIMELINE_SYSTEM = `你是「世界观工坊」的时间线整合师。你会收到一个世界观的重大事件（带 id/time/title）和重要角色（带 id/name/role/identity/description/已有 eventIds/timeline/relations）。你的任务是只根据这些事实，补齐角色与事件之间的时间关系，输出一个 JSON 对象。

输出格式：
{
  "reply": "给用户看的中文回复，1-3 句；没有可补充的就说明",
  "characters": [
    {"id": "ch_x", "eventIds": ["ev_y"], "timeline": [{"time": "事件时间", "title": "角色在事件中的经历", "description": "具体做了什么", "eventId": "ev_y"}], "relations": [{"targetId": "ch_z", "type": "盟友/敌对/亲属/师徒/恋人/上下级/竞争/其他", "note": "关系张力"}]}
  ],
  "notes": ["可选：你判断出的因果或时间冲突，供用户参考"]
}

规则：
1. 只输出 JSON，不要代码围栏或解释。
2. 只能使用给定的事件 id 与角色 id，不能编造新 id、新事件或新角色。
3. eventIds 表示该角色明确参与的事件：依据角色 description、identity、已有 eventIds/timeline、以及事件文本中的姓名或明确指代。不确定就不写。
4. timeline 只补角色在事件中的具体经历，尽量带 eventId；同一事件不要重复，已有时间点不要重复。
5. relations 只补文本中明显存在的关系（共同阵营、敌对、亲属、师徒、上下级等）；targetId 必须存在且不能是自己，不确定就不写。
6. 不要修改事件本身，不要修改角色姓名与身份；你只做增量补充。
7. 没有可补充内容时，characters 返回空数组，在 reply 里说明。`;

/* ------------------------------------------------------------------ 变更 */

function normalizeChange(change) {
  const source = change && typeof change === 'object' ? change : {};
  let target = String(source.target ?? source.kind ?? source.type ?? '').trim();
  const lower = target.toLowerCase().replace(/[.\s_]/g, '');
  const alias = TARGET_ALIAS.get(lower);
  if (alias) target = alias;
  else if (SCALAR_TARGETS.has(lower)) target = lower;
  else if (lower === 'mapnotes' || lower === 'map') target = 'mapnotes';
  const action = String(source.action ?? source.op ?? 'set').toLowerCase();
  const data = source.data && typeof source.data === 'object' ? source.data : (
    source.value && typeof source.value === 'object' ? source.value : {}
  );
  const id = typeof source.id === 'string' ? source.id : (typeof data.id === 'string' ? data.id : '');
  const text = cleanText(source.text ?? (typeof source.value === 'string' ? source.value : ''), LIMITS.entryContent);
  return { target, action, id, data, text };
}

function entryArrayOf(world, target) {
  if (target === 'marker') return asArray(world.map?.markers);
  const spec = ENTRY_TARGETS[target];
  return spec ? asArray(world[spec.array]) : [];
}

function setEntryArray(world, target, value) {
  if (target === 'marker') {
    world.map = { ...(world.map || {}), markers: value.slice(0, LIMITS.markerCount) };
  } else {
    const spec = ENTRY_TARGETS[target];
    if (!spec) return;
    world[spec.array] = value;
  }
}

function entryFromData(target, data) {
  const source = data && typeof data === 'object' ? data : {};
  if (target === 'event') return normalizeEvents([source])[0];
  if (target === 'timeline') return normalizeTimeline([source])[0];
  if (target === 'marker') return normalizeMarkers([source])[0];
  const prefix = target === 'composition' ? 'cp' : 'se';
  return entryStamp(source, prefix, {
    title: cleanText(source.title ?? source.name, LIMITS.entryTitle) || '未命名条目',
    content: cleanText(source.content ?? source.description ?? source.text, LIMITS.entryContent),
  });
}

function mergeEntry(existing, data, target) {
  const source = data && typeof data === 'object' ? data : {};
  if (target === 'event') {
    return {
      ...existing,
      time: cleanText(source.time ?? source.at ?? existing.time, LIMITS.eventTime),
      title: cleanText(source.title ?? source.name ?? existing.title, LIMITS.entryTitle) || existing.title,
      description: cleanText(source.description ?? source.content ?? existing.description, LIMITS.entryContent),
      impact: cleanText(source.impact ?? source.consequence ?? existing.impact, LIMITS.eventImpact),
      updatedAt: now(),
    };
  }
  if (target === 'timeline') {
    return {
      ...existing,
      name: cleanText(source.name ?? source.title ?? source.era ?? existing.name, LIMITS.entryTitle) || existing.name,
      span: cleanText(source.span ?? source.time ?? existing.span, LIMITS.eventTime),
      description: cleanText(source.description ?? source.content ?? existing.description, LIMITS.entryContent),
      updatedAt: now(),
    };
  }
  if (target === 'marker') {
    let x = Number(source.x);
    let y = Number(source.y);
    if (Number.isFinite(x) && x > 1 && x <= 100) x /= 100;
    if (Number.isFinite(y) && y > 1 && y <= 100) y /= 100;
    return {
      ...existing,
      name: cleanText(source.name ?? source.title ?? existing.name, LIMITS.entryTitle) || existing.name,
      x: Number.isFinite(x) ? boundedNumber(x, 0, 1, existing.x) : existing.x,
      y: Number.isFinite(y) ? boundedNumber(y, 0, 1, existing.y) : existing.y,
      note: cleanText(source.note ?? source.content ?? existing.note, LIMITS.entryContent),
      updatedAt: now(),
    };
  }
  return {
    ...existing,
    title: cleanText(source.title ?? source.name ?? existing.title, LIMITS.entryTitle) || existing.title,
    content: cleanText(source.content ?? source.description ?? source.text ?? existing.content, LIMITS.entryContent),
    updatedAt: now(),
  };
}

function mergeByKey(existing, incoming, keyOf, cap) {
  const out = [...existing];
  const seen = new Set(existing.map((item) => keyOf(item)));
  for (const item of incoming) {
    const key = keyOf(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= cap) break;
  }
  return out;
}

function characterFromData(data) {
  return normalizeCharacters([data])[0];
}

function findCharacter(world, ref) {
  if (!ref) return null;
  return world.characters.find((character) => character.id === ref)
    || world.characters.find((character) => character.name === ref)
    || null;
}

function mergeCharacter(existing, data) {
  const source = data && typeof data === 'object' ? data : {};
  const merged = {
    ...existing,
    ...source,
    id: existing.id,
    name: cleanText(source.name, LIMITS.characterName) || existing.name,
    image: Object.hasOwn(source, 'image') ? imageName(source.image) : existing.image,
    relatedEntries: mergeByKey(
      existing.relatedEntries,
      normalizeRelatedEntries(source.relatedEntries ?? source.related),
      (item) => `${item.kind}:${item.id}`,
      LIMITS.characterRelated,
    ),
    timeline: mergeByKey(
      existing.timeline,
      normalizeCharacterTimeline(source.timeline ?? source.points),
      (item) => item.eventId || `${item.time}|${item.title}`,
      LIMITS.characterTimelineCount,
    ),
    eventIds: unique([
      ...existing.eventIds,
      ...asArray(source.eventIds).map((id) => validId(id, ['ev'])).filter(Boolean),
    ]).slice(0, LIMITS.characterEventIds),
    relations: mergeByKey(
      existing.relations,
      normalizeRelations(source.relations ?? source.relationships),
      (item) => `${item.targetId || item.targetName}|${item.type}`,
      LIMITS.characterRelations,
    ),
  };
  return normalizeCharacters([merged])[0];
}

function mergeCharacterList(existing, incoming) {
  const out = [...existing];
  for (const character of incoming) {
    const index = out.findIndex((item) => item.id === character.id || item.name === character.name);
    if (index >= 0) out[index] = mergeCharacter(out[index], character);
    else out.push(character);
    if (out.length >= LIMITS.characterCount) break;
  }
  return out;
}

function labelOfTarget(target) {
  return {
    event: '事件',
    timeline: '时代',
    composition: '构成',
    setting: '设定',
    marker: '地图标注',
    character: '角色',
    charactertimeline: '角色时间点',
    characterrelation: '角色关系',
  }[target] ?? target;
}

function scalarLabel(field) {
  return {
    name: '名称',
    type: '世界类型',
    style: '风格',
    era: '时代',
    eraNote: '时代说明',
    summary: '总览',
    mapNotes: '地图说明',
  }[field] ?? field;
}

/** 把模型/Agent 的 changes 应用到世界。返回新世界、已应用清单与警告。 */
function applyChanges(rawWorld, changes) {
  const world = structuredClone(rawWorld);
  const applied = [];
  const warnings = [];
  const list = asArray(changes).slice(0, 40);
  let touchedEvents = false;

  for (const rawChange of list) {
    const { target, action, id, data, text } = normalizeChange(rawChange);

    if (SCALAR_TARGETS.has(target)) {
      const field = SCALAR_TARGETS.get(target);
      if (target === 'mapnotes') {
        const notes = text || cleanText(data?.notes ?? data?.content, LIMITS.entryContent);
        world.map = { ...(world.map || {}), notes };
        applied.push('更新地图说明');
      } else {
        world[field] = text.slice(0, LIMITS[field] ?? LIMITS.entryContent);
        applied.push(`更新${scalarLabel(field)}`);
      }
      continue;
    }

    if (target === 'character') {
      if (action === 'add') {
        const character = characterFromData(data);
        if (!character.name || character.name === '未命名角色') {
          warnings.push('新增角色缺少姓名，已跳过');
          continue;
        }
        const duplicate = world.characters.find((item) => item.name === character.name);
        if (duplicate) {
          world.characters = world.characters.map((item) => (item.id === duplicate.id ? mergeCharacter(item, data) : item));
          applied.push(`更新角色「${character.name}」`);
        } else {
          world.characters.push(character);
          applied.push(`新增角色「${character.name}」`);
        }
        continue;
      }
      const index = world.characters.findIndex((item) => item.id === id);
      if (index < 0) {
        warnings.push(`找不到要${action === 'remove' ? '删除' : '更新'}的角色：${id || '(缺少 id)'}`);
        continue;
      }
      if (action === 'remove') {
        const name = world.characters[index].name;
        world.characters.splice(index, 1);
        applied.push(`删除角色「${name}」`);
      } else if (action === 'update') {
        world.characters[index] = mergeCharacter(world.characters[index], data);
        applied.push(`更新角色「${world.characters[index].name}」`);
      } else {
        warnings.push(`角色不支持动作：${action}`);
      }
      continue;
    }

    if (target === 'charactertimeline') {
      const character = findCharacter(world, data.characterId ?? data.character ?? id);
      if (!character) {
        warnings.push('找不到要添加时间点的角色');
        continue;
      }
      if (action === 'add') {
        const point = normalizeCharacterTimeline([{
          time: data.time ?? data.at,
          title: data.title ?? data.name,
          description: data.description ?? data.content,
          eventId: data.eventId,
        }])[0];
        const duplicate = character.timeline.some((item) => (point.eventId && item.eventId === point.eventId) || (item.time === point.time && item.title === point.title));
        if (duplicate) warnings.push(`角色「${character.name}」已有相同时间点`);
        else {
          character.timeline = sortCharacterPoints([...character.timeline, point]);
          applied.push(`为角色「${character.name}」新增时间点「${point.title}」`);
        }
      } else if (action === 'remove') {
        const pointId = data.pointId ?? id;
        const before = character.timeline.length;
        character.timeline = character.timeline.filter((item) => item.id !== pointId);
        if (character.timeline.length < before) applied.push(`删除角色「${character.name}」的时间点`);
        else warnings.push('找不到要删除的角色时间点');
      } else {
        warnings.push(`角色时间点不支持动作：${action}`);
      }
      continue;
    }

    if (target === 'characterrelation') {
      const from = findCharacter(world, data.fromId ?? data.characterId ?? id);
      const targetCharacter = findCharacter(world, data.targetId ?? data.target);
      if (!from || !targetCharacter || from.id === targetCharacter.id) {
        warnings.push('角色关系需要两个不同的、已存在的角色');
        continue;
      }
      if (action === 'remove') {
        const before = from.relations.length;
        from.relations = from.relations.filter((item) => !(item.targetId === targetCharacter.id && (!data.type || item.type === data.type)));
        if (from.relations.length < before) applied.push(`删除角色关系「${from.name} — ${targetCharacter.name}」`);
        else warnings.push('找不到要删除的角色关系');
      } else {
        const type = cleanText(data.type, 40) || '其他';
        const exists = from.relations.some((item) => item.targetId === targetCharacter.id && item.type === type);
        if (exists) warnings.push('这条角色关系已经存在');
        else {
          from.relations.push({ id: newId('rel'), targetId: targetCharacter.id, type, note: cleanText(data.note, 800), createdAt: now(), updatedAt: now() });
          applied.push(`新增角色关系「${from.name} — ${targetCharacter.name}」`);
        }
      }
      continue;
    }

    if (!ENTRY_TARGETS[target]) {
      warnings.push(`忽略了未知目标：${target || '(空)'}`);
      continue;
    }

    const entries = entryArrayOf(world, target);
    if (action === 'add') {
      const entry = entryFromData(target, data);
      if (!entry) {
        warnings.push(`新增${labelOfTarget(target)}失败：内容不完整`);
        continue;
      }
      entries.push(entry);
      setEntryArray(world, target, entries);
      if (target === 'event') touchedEvents = true;
      applied.push(`新增${labelOfTarget(target)}「${entry.title || entry.name}」`);
      continue;
    }

    if (action === 'update' || action === 'remove') {
      const index = entries.findIndex((entry) => entry.id === id);
      if (index < 0) {
        warnings.push(`找不到要${action === 'remove' ? '删除' : '更新'}的${labelOfTarget(target)}：${id || '(缺少 id)'}`);
        continue;
      }
      const before = entries[index];
      const name = before.title || before.name || id;
      if (action === 'remove') {
        entries.splice(index, 1);
        setEntryArray(world, target, entries);
        applied.push(`删除${labelOfTarget(target)}「${name}」`);
      } else {
        entries[index] = mergeEntry(before, data, target);
        setEntryArray(world, target, entries);
        applied.push(`更新${labelOfTarget(target)}「${entries[index].title || entries[index].name}」`);
      }
      if (target === 'event') touchedEvents = true;
      continue;
    }

    warnings.push(`忽略了未知动作：${action}`);
  }

  const normalized = normalizeWorld(world, { id: world.id, createdAt: world.createdAt, aiChat: world.aiChat });
  if (touchedEvents) normalized.events = sortEvents(normalized.events);
  normalized.updatedAt = now();
  return { world: normalized, applied, warnings };
}

/** 模型有时会直接返回完整 world；把它安全地并入当前世界。 */
function replaceWorldContent(base, incoming) {
  const source = incoming && typeof incoming === 'object' ? incoming : {};
  const merged = normalizeWorld(source, {
    id: base.id,
    createdAt: base.createdAt,
    aiChat: base.aiChat,
    fallbackName: base.name,
  });
  merged.map = { ...merged.map, image: base.map?.image || '' };
  const baseImages = new Map(base.characters.map((character) => [character.name, character.image]));
  merged.characters = merged.characters.map((character) => ({
    ...character,
    image: character.image || baseImages.get(character.name) || '',
  }));
  merged.rev = base.rev;
  merged.updatedAt = now();
  return merged;
}

/** 补全模式：只填空字段，按标题/时间合并条目，不改写已有内容。 */
function fillMissing(base, incoming) {
  const source = incoming && typeof incoming === 'object' ? incoming : {};
  const next = structuredClone(base);
  for (const field of ['type', 'style', 'era', 'eraNote', 'summary']) {
    const value = cleanText(source[field], LIMITS[field] ?? LIMITS.entryContent);
    if (!cleanText(next[field], LIMITS[field] ?? LIMITS.entryContent) && value) next[field] = value;
  }
  if (cleanText(next.name) === '' || next.name === '未命名世界观') {
    next.name = cleanText(source.name, LIMITS.name) || next.name;
  }
  if (next.tags.length === 0) {
    next.tags = unique(asArray(source.tags).map((tag) => cleanText(tag, 24)).filter(Boolean)).slice(0, 12);
  }
  next.timeline = mergeEntries(next.timeline, normalizeTimeline(source.timeline), (item) => item.name, LIMITS.timelineCount);
  next.events = sortEvents(mergeEntries(next.events, normalizeEvents(source.events), (item) => `${item.time}|${item.title}`, LIMITS.eventCount));
  next.composition = mergeEntries(next.composition, normalizeEntries(source.composition, 'cp', '未命名构成'), (item) => item.title, LIMITS.compositionCount);
  next.settings = mergeEntries(next.settings, normalizeEntries(source.settings, 'se', '未命名设定'), (item) => item.title, LIMITS.settingsCount);
  next.characters = mergeCharacterList(next.characters, normalizeCharacters(source.characters));
  if (!next.map.notes) next.map.notes = cleanText(source.map?.notes, LIMITS.entryContent);
  next.map.markers = mergeEntries(next.map.markers, normalizeMarkers(source.map?.markers), (item) => item.name, LIMITS.markerCount);
  next.updatedAt = now();
  return normalizeWorld(next, { id: base.id, createdAt: base.createdAt, aiChat: base.aiChat });
}

function mergeEntries(existing, incoming, keyOf, cap) {
  const out = [...existing];
  const seen = new Set(existing.map((item) => keyOf(item)));
  for (const item of incoming) {
    const key = keyOf(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= cap) break;
  }
  return out;
}

/* ------------------------------------------------------------------ 导出 */

function safeFilename(name, extension) {
  const base = String(name || '世界观').replace(/[\\/:*?"<>|\n\r\t]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 60) || '世界观';
  return `${base}.${extension}`;
}

function dateLabel() {
  const date = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function exportWorld(world, format, includeChat = false) {
  if (format === 'json') {
    const payload = {
      schema: SCHEMA,
      name: world.name,
      type: world.type,
      style: world.style,
      era: world.era,
      eraNote: world.eraNote,
      summary: world.summary,
      tags: world.tags,
      timeline: world.timeline.map(({ id, name, span, description }) => ({ id, name, span, description })),
      events: world.events.map(({ id, time, title, description, impact }) => ({ id, time, title, description, impact })),
      composition: world.composition.map(({ id, title, content }) => ({ id, title, content })),
      settings: world.settings.map(({ id, title, content }) => ({ id, title, content })),
      characters: world.characters.map((character) => ({
        id: character.id,
        name: character.name,
        role: character.role,
        identity: character.identity,
        species: character.species,
        nonHuman: character.nonHuman,
        npc: character.npc,
        description: character.description,
        relatedEntries: character.relatedEntries.map(({ kind, id, label }) => ({ kind, id, label })),
        timeline: character.timeline.map(({ id, time, title, description, eventId, source }) => ({ id, time, title, description, eventId, source })),
        eventIds: character.eventIds,
        relations: character.relations.map(({ id, targetId, type, note }) => ({ id, targetId, type, note })),
      })),
      map: { notes: world.map.notes, markers: world.map.markers.map(({ id, name, x, y, note }) => ({ id, name, x, y, note })) },
      exportedAt: new Date().toISOString(),
    };
    if (includeChat) payload.aiChat = world.aiChat;
    return { text: JSON.stringify(payload, null, 2), filename: safeFilename(world.name, 'json'), mime: 'application/json;charset=utf-8' };
  }

  const lines = [];
  if (format === 'markdown') {
    lines.push(`# ${world.name || '未命名世界观'}`, '');
    if (world.summary) lines.push(`> ${world.summary.replace(/\n/g, '\n> ')}`, '');
    lines.push('## 基本资料', '');
    lines.push(`- **世界类型**：${world.type || '未填写'}`);
    lines.push(`- **当前时代**：${world.era || '未填写'}`);
    if (world.tags.length) lines.push(`- **标签**：${world.tags.join('、')}`);
    lines.push('');
    if (world.style) lines.push('## 风格', '', world.style, '');
    if (world.eraNote) lines.push('## 时代说明', '', world.eraNote, '');
    if (world.timeline.length) {
      lines.push('## 时间线', '');
      world.timeline.forEach((item) => {
        lines.push(`### ${item.name}${item.span ? `（${item.span}）` : ''}`, '');
        if (item.description) lines.push(item.description, '');
      });
    }
    if (world.events.length) {
      lines.push('## 重大事件', '');
      world.events.forEach((event, index) => {
        lines.push(`### ${index + 1}. ${event.title}${event.time ? ` — ${event.time}` : ''}`, '');
        if (event.description) lines.push(event.description, '');
        if (event.impact) lines.push(`**影响**：${event.impact}`, '');
      });
    }
    if (world.characters.length) {
      lines.push('## 重要角色', '');
      const eventById = new Map(world.events.map((event) => [event.id, event]));
      const charById = new Map(world.characters.map((character) => [character.id, character]));
      world.characters.forEach((character) => {
        lines.push(`### ${character.name}${character.npc ? '（剧情 NPC）' : ''}`, '');
        lines.push(`- **角色**：${character.role || '未填写'}`);
        lines.push(`- **身份**：${character.identity || '未填写'}`);
        if (character.nonHuman || character.species) lines.push(`- **物种**：${character.species || '未填写'}`);
        if (character.image) lines.push('- **角色图**：已上传');
        lines.push('');
        if (character.description) lines.push(character.description, '');
        const relations = character.relations.map((relation) => {
          const target = charById.get(relation.targetId);
          return target ? `- **${target.name}**（${relation.type}）${relation.note ? `：${relation.note}` : ''}` : null;
        }).filter(Boolean);
        if (relations.length) lines.push('**关系**', '', ...relations, '');
        if (character.eventIds.length) {
          lines.push('**参与事件**', '');
          character.eventIds.map((id) => eventById.get(id)).filter(Boolean).forEach((event) => {
            lines.push(`- ${event.time ? `[${event.time}] ` : ''}${event.title}`);
          });
          lines.push('');
        }
        if (character.timeline.length) {
          lines.push('**角色时间线**', '');
          character.timeline.forEach((point) => {
            lines.push(`- ${point.time ? `[${point.time}] ` : ''}${point.title}${point.description ? `：${point.description}` : ''}`);
          });
          lines.push('');
        }
        if (character.relatedEntries.length) {
          lines.push(`**关联条目**：${character.relatedEntries.map((ref) => ref.label).filter(Boolean).join('、')}`, '');
        }
      });
    }
    if (world.composition.length) {
      lines.push('## 主要构成', '');
      world.composition.forEach((item) => lines.push(`### ${item.title}`, '', item.content || '（待补充）', ''));
    }
    if (world.map.notes) lines.push('## 世界地图', '', world.map.notes, '');
    if (world.map.markers.length) {
      lines.push('### 地图标注', '');
      world.map.markers.forEach((marker) => lines.push(`- **${marker.name}**（${Math.round(marker.x * 100)}%, ${Math.round(marker.y * 100)}%）${marker.note ? `：${marker.note}` : ''}`));
      lines.push('');
    }
    if (world.settings.length) {
      lines.push('## 基本设定', '');
      world.settings.forEach((item) => lines.push(`### ${item.title}`, '', item.content || '（待补充）', ''));
    }
    if (includeChat && world.aiChat.length) {
      lines.push('## AI 对话记录', '');
      world.aiChat.forEach((message) => lines.push(`**${message.role === 'assistant' ? 'AI' : '我'}**：${message.text}`, ''));
    }
    lines.push('---', `导出时间：${dateLabel()}`);
    return { text: lines.join('\n'), filename: safeFilename(world.name, 'md'), mime: 'text/markdown;charset=utf-8' };
  }

  lines.push(`《${world.name || '未命名世界观'}》`, '='.repeat(24), '');
  lines.push(`世界类型：${world.type || '未填写'}`);
  lines.push(`当前时代：${world.era || '未填写'}`);
  if (world.tags.length) lines.push(`标签：${world.tags.join('、')}`);
  lines.push('');
  if (world.summary) lines.push('【总览】', world.summary, '');
  if (world.style) lines.push('【风格】', world.style, '');
  if (world.eraNote) lines.push('【时代说明】', world.eraNote, '');
  if (world.timeline.length) {
    lines.push('【时间线】');
    world.timeline.forEach((item) => {
      lines.push(`${item.name}${item.span ? `（${item.span}）` : ''}`);
      if (item.description) lines.push(`  ${item.description}`);
    });
    lines.push('');
  }
  if (world.events.length) {
    lines.push('【重大事件】（按时间排序）');
    world.events.forEach((event, index) => {
      lines.push(`${index + 1}. ${event.time ? `[${event.time}] ` : ''}${event.title}`);
      if (event.description) lines.push(`   ${event.description}`);
      if (event.impact) lines.push(`   影响：${event.impact}`);
    });
    lines.push('');
  }
  if (world.characters.length) {
    lines.push('【重要角色】');
    const eventById = new Map(world.events.map((event) => [event.id, event]));
    const charById = new Map(world.characters.map((character) => [character.id, character]));
    world.characters.forEach((character) => {
      lines.push(`◆ ${character.name}${character.npc ? '（剧情 NPC）' : ''}`);
      lines.push(`  角色：${character.role || '未填写'}｜身份：${character.identity || '未填写'}${character.nonHuman || character.species ? `｜物种：${character.species || '未填写'}` : ''}`);
      if (character.description) lines.push(character.description);
      character.relations.forEach((relation) => {
        const target = charById.get(relation.targetId);
        if (target) lines.push(`  关系：${target.name}（${relation.type}）${relation.note ? ` — ${relation.note}` : ''}`);
      });
      character.eventIds.map((id) => eventById.get(id)).filter(Boolean).forEach((event) => {
        lines.push(`  参与事件：${event.time ? `[${event.time}] ` : ''}${event.title}`);
      });
      character.timeline.forEach((point) => {
        lines.push(`  时间线：${point.time ? `[${point.time}] ` : ''}${point.title}${point.description ? ` — ${point.description}` : ''}`);
      });
      if (character.relatedEntries.length) lines.push(`  关联条目：${character.relatedEntries.map((ref) => ref.label).filter(Boolean).join('、')}`);
      lines.push('');
    });
  }
  if (world.composition.length) {
    lines.push('【主要构成】');
    world.composition.forEach((item) => lines.push(`◆ ${item.title}`, item.content || '（待补充）', ''));
  }
  if (world.map.notes) lines.push('【世界地图】', world.map.notes, '');
  if (world.map.markers.length) {
    lines.push('地图标注：');
    world.map.markers.forEach((marker) => lines.push(`  · ${marker.name}（${Math.round(marker.x * 100)}%, ${Math.round(marker.y * 100)}%）${marker.note ? `：${marker.note}` : ''}`));
    lines.push('');
  }
  if (world.settings.length) {
    lines.push('【基本设定】');
    world.settings.forEach((item) => lines.push(`◆ ${item.title}`, item.content || '（待补充）', ''));
  }
  if (includeChat && world.aiChat.length) {
    lines.push('【AI 对话记录】');
    world.aiChat.forEach((message) => lines.push(`${message.role === 'assistant' ? 'AI' : '我'}：${message.text}`, ''));
  }
  lines.push('—'.repeat(24), `导出时间：${dateLabel()}`);
  return { text: lines.join('\n'), filename: safeFilename(world.name, 'txt'), mime: 'text/plain;charset=utf-8' };
}

/* --------------------------------------------------------------- AI 任务 */

function scaleLimit(scale) {
  if (scale === 'brief') return { maxTokens: 4096, hint: '篇幅偏简要：每个字段 1-2 句，总字数控制在 2500 字以内。' };
  if (scale === 'deep') return { maxTokens: 16384, hint: '篇幅详尽：每个字段写到 3-5 句，事件与条目可以多一些，总字数 6000-9000 字。' };
  return { maxTokens: 8192, hint: '篇幅标准：每个字段 2-3 句，总字数 3500-5000 字。' };
}

async function generateWorld(ctx, payload, signal) {
  const mode = ['new', 'fill', 'overwrite'].includes(payload.mode) ? payload.mode : 'new';
  const prompt = cleanText(payload.prompt, 6000);
  if (!prompt && mode === 'new') throw new AppError('worldbuilding/empty-prompt', '请先写一句世界观的核心想法');
  const scale = scaleLimit(payload.scale);
  let base = null;
  if (mode !== 'new') base = await resolveWorldRef(payload.id ?? payload.worldId);
  const system = [GENERATE_SYSTEM, scale.hint, mode === 'fill' ? FILL_RULES : mode === 'overwrite' ? OVERWRITE_RULES : '']
    .filter(Boolean).join('\n\n');
  const parts = [];
  if (prompt) parts.push(`用户的想法与要求：\n${prompt}`);
  if (payload.typeHint) parts.push(`世界类型偏好：${cleanText(payload.typeHint, LIMITS.type)}`);
  if (payload.styleHint) parts.push(`风格偏好：${cleanText(payload.styleHint, 2000)}`);
  if (base) parts.push(`已有的世界观（需要在其基础上处理，保持专有名词一致）：\n${compactWorld(base, 14000)}`);
  parts.push(`请按以下 JSON 结构输出：\n${SCHEMA_GUIDE}`);
  parts.push('只输出 JSON 对象。');

  const out = await runModel(ctx, {
    system,
    prompt: parts.join('\n\n'),
    maxTokens: scale.maxTokens,
    temperature: 0.85,
    signal,
  });
  const data = parseModelJson(out.text, '生成');

  if (mode === 'new') {
    const world = normalizeWorld(data, {
      fallbackName: cleanText(payload.worldName, LIMITS.name) || prompt.slice(0, 40) || '未命名世界观',
    });
    if (payload.typeHint && !world.type) world.type = cleanText(payload.typeHint, LIMITS.type);
    const inserted = await insertWorld(world);
    return { world: inserted, rev: inserted.rev, state: await getState(), usage: out.usage, mode };
  }

  const merged = mode === 'fill' ? fillMissing(base, data) : replaceWorldContent(base, data);
  const saved = await saveWorldWithConflict(base.id, merged, base.rev);
  return { world: saved, rev: saved.rev, state: await getState(), usage: out.usage, mode };
}

async function importWorld(ctx, payload, signal) {
  const text = cleanText(payload.text, LIMITS.importText);
  if (text.replace(/\s/g, '').length < 4) throw new AppError('worldbuilding/empty-import', '请粘贴或上传要导入的内容');
  const mode = payload.mode === 'merge' ? 'merge' : 'new';
  let base = null;
  if (mode === 'merge') base = await resolveWorldRef(payload.id ?? payload.worldId);

  const out = await runModel(ctx, {
    system: IMPORT_SYSTEM,
    prompt: `${base ? `已有世界观（导入内容将合并进去）：\n${compactWorld(base, 8000)}\n\n` : ''}请整理以下资料：\n<<<\n${text}\n>>>`,
    maxTokens: 8192,
    temperature: 0.3,
    signal,
  });
  let data;
  try {
    data = parseModelJson(out.text, '导入');
  } catch (error) {
    try {
      const raw = JSON.parse(text);
      if (raw && typeof raw === 'object' && (raw.name || raw.events || raw.settings)) data = raw;
      else throw error;
    } catch {
      throw error;
    }
  }

  const warnings = [];
  if (text.length >= LIMITS.importText) warnings.push('导入文本过长，已截断到 80,000 字符');
  if (mode === 'merge' && base) {
    const merged = fillMissing(base, data);
    const saved = await saveWorldWithConflict(base.id, merged, base.rev);
    return { world: saved, rev: saved.rev, state: await getState(), usage: out.usage, warnings, mode };
  }

  const world = normalizeWorld(data, {
    fallbackName: cleanText(payload.worldName, LIMITS.name) || cleanText(data.name, LIMITS.name) || '导入的世界观',
  });
  const inserted = await insertWorld(world);
  return { world: inserted, rev: inserted.rev, state: await getState(), usage: out.usage, warnings, mode };
}

async function chatWorld(ctx, payload, signal) {
  const message = cleanText(payload.message, 8000);
  if (!message) throw new AppError('worldbuilding/empty-message', '请先输入要补充的内容');
  let world = await resolveWorldRef(payload.id);

  const history = world.aiChat.slice(-8).map((item) => `${item.role === 'assistant' ? 'AI' : '用户'}：${item.text}`).join('\n');
  const out = await runModel(ctx, {
    system: CHAT_SYSTEM,
    prompt: [
      `当前世界观：\n${compactWorld(world, 20000)}`,
      history ? `最近对话：\n${history}` : '最近对话：（无）',
      `用户的新消息：\n${message}`,
      '只输出 JSON 对象。',
    ].join('\n\n'),
    maxTokens: 6144,
    temperature: 0.7,
    signal,
  });

  let data;
  try {
    data = parseModelJson(out.text, '对话');
  } catch {
    data = { reply: out.text.slice(0, 8000), changes: [] };
  }
  const changes = asArray(data.changes);
  const whole = !changes.length && data.world && typeof data.world === 'object' ? data.world : null;
  const reply = cleanText(data.reply, LIMITS.chatText) || (changes.length || whole ? '已按你的要求补充进世界观。' : '这次没有需要改动的内容。');

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const latest = attempt === 0 ? world : await requireWorld(world.id);
    world = latest;
    const result = whole
      ? { world: replaceWorldContent(latest, whole), applied: ['整体重写世界观内容'], warnings: [] }
      : changes.length
        ? applyChanges(latest, changes)
        : { world: normalizeWorld(latest, { id: latest.id, createdAt: latest.createdAt, aiChat: latest.aiChat }), applied: [], warnings: [] };
    const next = result.world;
    next.aiChat = normalizeChat([
      ...latest.aiChat,
      { id: newId('msg'), role: 'user', text: message, at: now() },
      { id: newId('msg'), role: 'assistant', text: reply, at: now(), changes: result.applied },
    ]);
    try {
      const saved = await saveWorldWithConflict(latest.id, next, latest.rev);
      return { world: saved, rev: saved.rev, state: await getState(), reply, applied: result.applied, warnings: result.warnings, usage: out.usage };
    } catch (error) {
      if (error.code !== 'worldbuilding/conflict' || attempt === 2) throw error;
    }
  }
  throw new AppError('worldbuilding/conflict', '世界观刚被其他操作修改，请重试');
}

async function saveWorldWithConflict(id, world, expectedRev) {
  return withLock(id, async () => {
    const existing = await requireWorld(id);
    if (Number(expectedRev) !== existing.rev) {
      throw new AppError('worldbuilding/conflict', '世界观已更新，请刷新后重试', { rev: existing.rev });
    }
    const next = normalizeWorld(world, { id, createdAt: existing.createdAt, aiChat: world.aiChat });
    next.rev = existing.rev + 1;
    next.updatedAt = now();
    await writeWorld(next);
    await cleanupCharacterImages(id, existing, next).catch(() => {});
    cacheFromWorld(next);
    return next;
  });
}

/* ------------------------------------------------------------- 时间轴整合 */

function eventMentionsCharacter(event, character) {
  const name = cleanText(character.name, LIMITS.characterName);
  if (name.length < 2) return false;
  const haystack = `${event.title}\n${event.description}\n${event.impact}`;
  return haystack.includes(name);
}

function participatedEventIds(world, character) {
  const ids = new Set(character.eventIds);
  for (const event of world.events) {
    if (eventMentionsCharacter(event, character)) ids.add(event.id);
  }
  return [...ids];
}

/** 供时间轴 UI 与工具读取的事实视图：事件参与、角色时间点、关系对象。 */
function timelineFacts(world) {
  const byId = new Map(world.characters.map((character) => [character.id, character]));
  const participation = new Map(world.characters.map((character) => [character.id, new Set(participatedEventIds(world, character))]));
  const events = world.events.map((event) => ({
    id: event.id,
    time: event.time,
    title: event.title,
    description: event.description,
    impact: event.impact,
    year: parseYear(event.time),
    participants: world.characters
      .filter((character) => participation.get(character.id)?.has(event.id))
      .map((character) => character.id),
  }));
  const eventById = new Map(events.map((event) => [event.id, event]));
  const characters = world.characters.map((character) => {
    const eventIds = [...(participation.get(character.id) || [])];
    const points = [...character.timeline];
    for (const eventId of eventIds) {
      const event = eventById.get(eventId);
      if (!event) continue;
      if (points.some((point) => point.eventId === eventId || (point.time === event.time && point.title === event.title))) continue;
      points.push({
        id: `derived_${character.id}_${eventId}`,
        time: event.time,
        title: event.title,
        description: `参与事件：${event.title}`,
        eventId,
        source: 'derived',
        year: event.year,
      });
    }
    points.sort((left, right) => {
      const ly = left.year ?? parseYear(left.time) ?? Number.POSITIVE_INFINITY;
      const ry = right.year ?? parseYear(right.time) ?? Number.POSITIVE_INFINITY;
      return ly - ry;
    });
    return {
      id: character.id,
      name: character.name,
      role: character.role,
      identity: character.identity,
      species: character.species,
      nonHuman: character.nonHuman,
      npc: character.npc,
      description: character.description,
      image: character.image,
      eventIds,
      points,
      relations: character.relations.map((relation) => {
        const target = byId.get(relation.targetId);
        return {
          id: relation.id,
          targetId: relation.targetId,
          targetName: target?.name || '',
          type: relation.type,
          note: relation.note,
        };
      }).filter((relation) => relation.targetName),
    };
  });
  return { events, characters };
}

/** 从世界观内已有的事件文本与角色信息补齐时间轴事实；不调用模型，不改名、不改事件。 */
function integrateTimelineLocal(world) {
  const applied = [];
  const byId = new Map(world.events.map((event) => [event.id, event]));
  for (const character of world.characters) {
    const beforeIds = new Set(character.eventIds);
    const ids = new Set(participatedEventIds(world, character));
    const addedIds = [...ids].filter((id) => !beforeIds.has(id) && byId.has(id));
    if (addedIds.length) applied.push(`角色「${character.name}」关联 ${addedIds.length} 个参与事件`);
    character.eventIds = [...ids].filter((id) => byId.has(id));
    let addedPoints = 0;
    for (const eventId of character.eventIds) {
      const event = byId.get(eventId);
      if (!event) continue;
      if (character.timeline.some((point) => point.eventId === eventId || (point.time === event.time && point.title === event.title))) continue;
      character.timeline.push({
        id: newId('tp'),
        time: event.time,
        title: event.title,
        description: cleanText(`参与事件：${event.description || event.title}`, 500),
        eventId,
        source: 'auto',
        createdAt: now(),
        updatedAt: now(),
      });
      addedPoints += 1;
    }
    character.timeline = sortCharacterPoints(character.timeline);
    if (addedPoints) applied.push(`角色「${character.name}」补 ${addedPoints} 个时间点`);
  }
  return { world, applied };
}

function applyTimelineIntegration(world, data) {
  const applied = [];
  const warnings = [];
  const byId = new Map(world.characters.map((character) => [character.id, character]));
  const byName = new Map(world.characters.map((character) => [character.name, character]));
  const eventIds = new Set(world.events.map((event) => event.id));

  for (const item of asArray(data.characters)) {
    const character = byId.get(item?.id) || byName.get(cleanText(item?.name, LIMITS.characterName));
    if (!character) {
      warnings.push(`忽略了不存在的角色：${item?.id || item?.name || '(空)'}`);
      continue;
    }
    let addedEvents = 0;
    let addedPoints = 0;
    let addedRelations = 0;
    const freshEventIds = asArray(item.eventIds).map((id) => validId(id, ['ev'])).filter((id) => id && eventIds.has(id));
    for (const id of freshEventIds) {
      if (!character.eventIds.includes(id)) {
        character.eventIds.push(id);
        addedEvents += 1;
      }
    }
    for (const rawPoint of asArray(item.timeline)) {
      const point = normalizeCharacterTimeline([{ ...rawPoint, source: 'ai' }])[0];
      const duplicate = character.timeline.some((existing) => (point.eventId && existing.eventId === point.eventId) || (existing.time === point.time && existing.title === point.title));
      if (duplicate) continue;
      character.timeline.push(point);
      addedPoints += 1;
    }
    for (const rawRelation of asArray(item.relations)) {
      const targetId = validId(rawRelation?.targetId, ['ch']);
      if (!targetId || targetId === character.id || !byId.has(targetId)) {
        warnings.push(`角色「${character.name}」的关系对象无效，已忽略`);
        continue;
      }
      const type = cleanText(rawRelation.type, 40) || '其他';
      if (character.relations.some((relation) => relation.targetId === targetId && relation.type === type)) continue;
      character.relations.push({
        id: newId('rel'),
        targetId,
        type,
        note: cleanText(rawRelation.note, 800),
        createdAt: now(),
        updatedAt: now(),
      });
      addedRelations += 1;
    }
    character.timeline = sortCharacterPoints(character.timeline);
    if (addedEvents) applied.push(`角色「${character.name}」关联 ${addedEvents} 个参与事件`);
    if (addedPoints) applied.push(`角色「${character.name}」新增 ${addedPoints} 个时间点`);
    if (addedRelations) applied.push(`角色「${character.name}」新增 ${addedRelations} 条关系`);
  }
  return { world, applied, warnings };
}

async function integrateTimelineAi(ctx, payload, signal) {
  let world = await resolveWorldRef(payload.id ?? payload.worldId);
  const context = {
    events: world.events.slice(0, 200).map((event) => ({
      id: event.id, time: event.time, title: event.title,
      description: cut(event.description, 800), impact: cut(event.impact, 400),
    })),
    characters: world.characters.slice(0, 60).map((character) => ({
      id: character.id,
      name: character.name,
      role: character.role,
      identity: character.identity,
      species: character.species,
      npc: character.npc,
      description: cut(character.description, 800),
      eventIds: character.eventIds,
      timeline: character.timeline.slice(0, 30).map((point) => ({
        time: point.time, title: point.title, description: cut(point.description, 500), eventId: point.eventId,
      })),
      relations: character.relations.map((relation) => ({
        targetId: relation.targetId, type: relation.type, note: cut(relation.note, 400),
      })),
    })),
  };
  const out = await runModel(ctx, {
    system: AI_TIMELINE_SYSTEM,
    prompt: `请为以下世界观整合时间轴事实：\n${JSON.stringify(context)}\n只输出 JSON 对象。`,
    maxTokens: 8192,
    temperature: 0.3,
    signal,
  });
  const data = parseModelJson(out.text, '时间轴整合');
  const reply = cleanText(data.reply, 3000) || '时间轴已整合。';

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const latest = attempt === 0 ? world : await requireWorld(world.id);
    world = latest;
    const result = applyTimelineIntegration(latest, data);
    if (!result.applied.length) {
      return { world: latest, rev: latest.rev, state: await getState(), reply, applied: [], warnings: result.warnings, usage: out.usage };
    }
    try {
      const saved = await saveWorldWithConflict(latest.id, result.world, latest.rev);
      return { world: saved, rev: saved.rev, state: await getState(), reply, applied: result.applied, warnings: result.warnings, usage: out.usage };
    } catch (error) {
      if (error.code !== 'worldbuilding/conflict' || attempt === 2) throw error;
    }
  }
  throw new AppError('worldbuilding/conflict', '世界观刚被其他操作修改，请重试');
}

/* ---------------------------------------------------------------- 工具实现 */

function toolList() {
  return {
    name: 'worldbuilding_list',
    description: '列出世界观工坊里的全部世界观，以及当前激活的世界观。',
    parameters: { type: 'object', additionalProperties: false, properties: {} },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['activeId', 'worlds'],
        properties: {
          activeId: { type: 'string', description: '当前激活的世界观 id，没有则为空字符串' },
          worlds: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['id', 'name', 'type', 'era', 'completeness', 'events', 'characters'],
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                type: { type: 'string' },
                era: { type: 'string' },
                completeness: { type: 'integer' },
                events: { type: 'integer' },
                characters: { type: 'integer' },
              },
            },
          },
        },
      },
      render: (_args, value) => [{ type: 'text', text: renderWorldList(value) }],
    },
    async execute() {
      const state = await getState();
      return {
        activeId: state.activeId ?? '',
        worlds: state.worlds.map((world) => ({
          id: world.id,
          name: world.name,
          type: world.type,
          era: world.era,
          completeness: world.completeness,
          events: world.counts.events,
          characters: world.counts.characters,
        })),
      };
    },
  };
}

function renderWorldList(value) {
  const lines = [`共 ${value.worlds.length} 个世界观${value.activeId ? `，当前激活 id：${value.activeId}` : ''}。`];
  for (const world of value.worlds) {
    lines.push(`- ${world.name}（id: ${world.id}）｜类型：${world.type || '未填写'}｜时代：${world.era || '未填写'}｜完整度 ${world.completeness}%｜事件 ${world.events} 条｜角色 ${world.characters} 个${world.id === value.activeId ? '｜当前' : ''}`);
  }
  return lines.join('\n');
}

function toolRead() {
  return {
    name: 'worldbuilding_read',
    description: '读取一个世界观的内容。默认读取当前激活的世界观；可用 world 参数传入 id 或名称。section 可只读某一部分。',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        world: { type: 'string', description: '世界观 id 或名称；省略表示当前激活的世界观' },
        section: {
          type: 'string',
          description: '只读取某一部分：overview / timeline / events / composition / settings / map / characters / axis / all（默认 all）',
          enum: ['overview', 'timeline', 'events', 'composition', 'settings', 'map', 'characters', 'axis', 'all'],
        },
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'name', 'content'],
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          content: { type: 'string', description: '所选部分的 JSON 文本' },
        },
      },
      render: (_args, value) => [{ type: 'text', text: value.content }],
    },
    async execute(args) {
      const payload = args && typeof args === 'object' ? args : {};
      const world = await resolveWorldRef(payload.world);
      const section = typeof payload.section === 'string' ? payload.section : 'all';
      const picked = sectionWorld(world, section);
      return {
        id: world.id,
        name: world.name,
        content: JSON.stringify(picked, null, 2).slice(0, 40000),
      };
    },
  };
}

function sectionWorld(world, section) {
  const overview = {
    id: world.id,
    name: world.name,
    type: world.type,
    style: world.style,
    era: world.era,
    eraNote: world.eraNote,
    summary: world.summary,
    tags: world.tags,
    counts: countsOf(world),
    completeness: completenessOf(world),
  };
  if (section === 'overview') return overview;
  if (section === 'timeline') return { id: world.id, name: world.name, timeline: world.timeline };
  if (section === 'events') return { id: world.id, name: world.name, events: world.events };
  if (section === 'composition') return { id: world.id, name: world.name, composition: world.composition };
  if (section === 'settings') return { id: world.id, name: world.name, settings: world.settings };
  if (section === 'map') return { id: world.id, name: world.name, map: world.map };
  if (section === 'characters') return { id: world.id, name: world.name, characters: world.characters };
  if (section === 'axis') return { id: world.id, name: world.name, facts: timelineFacts(world) };
  return {
    ...overview,
    timeline: world.timeline,
    events: world.events,
    composition: world.composition,
    settings: world.settings,
    map: world.map,
    characters: world.characters,
  };
}

function toolUpdate() {
  return {
    name: 'worldbuilding_update',
    description: '向一个世界观增量写入内容。changes 是一组变更；默认作用于当前激活的世界观。事件会按时间自动排序，已有条目用 id 更新或删除。',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['changes'],
      properties: {
        world: { type: 'string', description: '世界观 id 或名称；省略表示当前激活的世界观' },
        changes: {
          type: 'array',
          description: '变更列表，一次最多 40 条',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['target', 'action'],
            properties: {
              target: {
                type: 'string',
                description: '目标：name/type/style/era/eraNote/summary/mapNotes（标量）；event/timeline/composition/setting/marker（条目）；character（角色）、characterTimeline（角色时间点）、characterRelation（角色关系）',
                enum: ['name', 'type', 'style', 'era', 'eraNote', 'summary', 'mapNotes', 'event', 'timeline', 'composition', 'setting', 'marker', 'character', 'characterTimeline', 'characterRelation'],
              },
              action: {
                type: 'string',
                description: '动作：set（标量）或 add/update/remove（条目）',
                enum: ['set', 'add', 'update', 'remove'],
              },
              id: { type: 'string', description: 'update/remove 时必填：已有条目的 id' },
              text: { type: 'string', description: 'set 标量时的新文本' },
              data: {
                type: 'object',
                description: '条目内容。event: time/title/description/impact；timeline: name/span/description；composition/setting: title/content；marker: name/x/y/note（x/y 为 0-1）；character: name/role/identity/species/nonHuman/npc/description/timeline/relations；characterTimeline: characterId/time/title/description/eventId；characterRelation: fromId/target/type/note',
                additionalProperties: true,
              },
            },
          },
        },
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['worldId', 'name', 'applied', 'warnings', 'events', 'composition', 'settings', 'characters'],
        properties: {
          worldId: { type: 'string' },
          name: { type: 'string' },
          applied: { type: 'array', items: { type: 'string' } },
          warnings: { type: 'array', items: { type: 'string' } },
          events: { type: 'integer' },
          composition: { type: 'integer' },
          settings: { type: 'integer' },
          characters: { type: 'integer' },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `已更新《${value.name}》（${value.worldId}）：${value.applied.length ? value.applied.join('；') : '没有实际改动'}${value.warnings.length ? `\n警告：${value.warnings.join('；')}` : ''}`,
      }],
    },
    async execute(args) {
      const payload = args && typeof args === 'object' ? args : {};
      const changes = asArray(payload.changes);
      if (!changes.length) throw new AppError('worldbuilding/empty-changes', 'changes 不能为空');
      const base = await resolveWorldRef(payload.world);
      const applied = [];
      const warnings = [];
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const current = attempt === 0 ? base : await requireWorld(base.id);
        const result = applyChanges(current, changes);
        applied.splice(0, applied.length, ...result.applied);
        warnings.splice(0, warnings.length, ...result.warnings);
        try {
          const saved = await saveWorldWithConflict(current.id, result.world, current.rev);
          return {
            worldId: saved.id,
            name: saved.name,
            applied,
            warnings,
            events: saved.events.length,
            composition: saved.composition.length,
            settings: saved.settings.length,
            characters: saved.characters.length,
          };
        } catch (error) {
          if (error.code !== 'worldbuilding/conflict' || attempt === 2) throw error;
        }
      }
      throw new AppError('worldbuilding/conflict', '世界观刚被其他操作修改，请重试');
    },
  };
}

function toolCreate() {
  return {
    name: 'worldbuilding_create',
    description: '新建一个空世界观并设为当前世界观。之后用 worldbuilding_update 写入内容。',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['name'],
      properties: {
        name: { type: 'string', description: '世界观名称' },
        type: { type: 'string', description: '世界类型，例如高魔奇幻 / 科幻 / 东方仙侠' },
        era: { type: 'string', description: '当前时代名称' },
        summary: { type: 'string', description: '一句话或一段总览' },
        activate: { type: 'boolean', description: '是否设为当前世界观，默认 true' },
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'name', 'activeId'],
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          activeId: { type: 'string' },
        },
      },
      render: (_args, value) => [{ type: 'text', text: `已新建《${value.name}》（${value.id}），当前世界观：${value.activeId}` }],
    },
    async execute(args) {
      const payload = args && typeof args === 'object' ? args : {};
      const name = cleanText(payload.name, LIMITS.name);
      if (!name) throw new AppError('worldbuilding/empty-name', '请提供世界观名称');
      const world = emptyWorld(name);
      world.type = cleanText(payload.type, LIMITS.type);
      world.era = cleanText(payload.era, LIMITS.era);
      world.summary = cleanText(payload.summary, LIMITS.summary);
      const before = (await loadIndex()).activeId;
      const inserted = await insertWorld(world);
      if (payload.activate === false) {
        await withLock('index', async () => {
          const index = await loadIndex();
          index.activeId = before && before !== inserted.id ? before : index.activeId;
          await saveIndex(index);
        });
        await refreshPromptCache();
      }
      return { id: inserted.id, name: inserted.name, activeId: (await loadIndex()).activeId };
    },
  };
}

/* -------------------------------------------------------------- 提示词缓存 */

let promptCache = { at: 0, activeId: null, text: '当前还没有世界观。' };

function cacheFromWorld(world) {
  promptCache = {
    at: now(),
    activeId: world.id,
    text: `当前激活的世界观：《${world.name}》｜类型：${world.type || '未填写'}｜时代：${world.era || '未填写'}｜事件 ${world.events.length} 条，重要角色 ${world.characters.length} 个，主要构成 ${world.composition.length} 条，基本设定 ${world.settings.length} 条｜完整度 ${completenessOf(world)}%。`,
  };
}

async function refreshPromptCache() {
  try {
    const index = await loadIndex();
    if (!index.activeId) {
      promptCache = { at: now(), activeId: null, text: '当前还没有世界观。' };
      return;
    }
    const world = await readWorldById(index.activeId);
    if (world) cacheFromWorld(world);
    else promptCache = { at: now(), activeId: null, text: '当前还没有世界观。' };
  } catch {
    /* 缓存失败不影响主流程 */
  }
}

function worldbuildingPromptSection() {
  if (!promptCache.activeId) return '';
  return `【世界观工坊】
用户可以在「世界观工坊」里管理多个彼此隔离的世界观。需要读取或补充世界观时，使用这些工具：
- worldbuilding_list：列出全部世界观；
- worldbuilding_read：读取世界观（默认当前激活的那个，可指定 world 与 section）；
- worldbuilding_update：增量增补/修改（事件、时代、重要角色、角色关系、角色时间点、主要构成、基本设定、地图标注、类型、风格、总览）；
- worldbuilding_create：新建世界观。
用户说「补充当前世界观」「把某某写进世界观」「加一个角色」时，先 worldbuilding_read 确认已有内容，再 worldbuilding_update 写入；不要编造并覆盖用户已有的设定。事件与角色时间点会按时间自动排序。
${promptCache.text}`;
}

/* ------------------------------------------------------------------- RPC */

async function route(ctx, endpoint, payload, signal) {
  const input = payload && typeof payload === 'object' ? payload : {};
  switch (endpoint) {
    case 'ping':
      return { pong: true, build: BUILD, dataDir: DATA_DIR };
    case 'state': {
      const state = await getState();
      const active = state.worlds.find((world) => world.id === state.activeId);
      if (active) {
        const world = await readWorldById(active.id);
        if (world) cacheFromWorld(world);
      } else {
        promptCache = { at: now(), activeId: null, text: '当前还没有世界观。' };
      }
      return state;
    }
    case 'world/get': {
      const world = await resolveWorldRef(input.id);
      return { world, rev: world.rev, state: await getState() };
    }
    case 'world/create': {
      const name = cleanText(input.name, LIMITS.name) || '未命名世界观';
      const world = emptyWorld(name);
      if (input.template === 'fantasy') {
        world.type = '高魔奇幻';
        world.settings.push(...normalizeEntries([{ title: '力量体系', content: '在这里写清楚力量的来源、上限与代价。' }], 'se', '设定'));
      } else if (input.template === 'scifi') {
        world.type = '科幻';
      }
      const inserted = await insertWorld(world);
      return { world: inserted, rev: inserted.rev, state: await getState() };
    }
    case 'world/save': {
      const world = input.world;
      if (!world || typeof world !== 'object') throw new AppError('worldbuilding/bad-world', '保存内容格式不正确');
      const id = cleanText(input.id ?? world.id, 80);
      const saved = await saveWorldWithConflict(id, world, input.rev ?? world.rev);
      return { world: saved, rev: saved.rev, state: await getState() };
    }
    case 'world/delete': {
      const id = cleanText(input.id, 80);
      const world = await requireWorld(id);
      await withLock('index', async () => {
        const index = await loadIndex();
        index.order = index.order.filter((item) => item !== id);
        if (index.activeId === id) index.activeId = index.order[0] ?? null;
        await saveIndex(index);
      });
      await rm(worldFile(id), { force: true });
      await rm(join(MEDIA_DIR, id), { recursive: true, force: true }).catch(() => {});
      const state = await getState();
      const active = state.worlds.find((item) => item.id === state.activeId);
      if (active) {
        const full = await readWorldById(active.id);
        if (full) cacheFromWorld(full);
      } else {
        promptCache = { at: now(), activeId: null, text: '当前还没有世界观。' };
      }
      return { deleted: world.name, state };
    }
    case 'world/activate': {
      const world = await resolveWorldRef(input.id);
      await withLock('index', async () => {
        const index = await loadIndex();
        index.order = index.order.includes(world.id) ? index.order : [world.id, ...index.order];
        index.activeId = world.id;
        await saveIndex(index);
      });
      cacheFromWorld(world);
      return { state: await getState() };
    }
    case 'world/map': {
      const world = await resolveWorldRef(input.id);
      if (!world.map.image) return { image: '', dataUrl: '' };
      try {
        const bytes = await readFile(join(MEDIA_DIR, world.id, world.map.image));
        const extension = world.map.image.split('.').pop()?.toLowerCase() ?? 'png';
        const mime = extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg' : `image/${extension}`;
        return { image: world.map.image, dataUrl: `data:${mime};base64,${bytes.toString('base64')}` };
      } catch {
        return { image: '', dataUrl: '' };
      }
    }
    case 'world/map/upload': {
      const world = await resolveWorldRef(input.id);
      const match = /^data:(image\/(png|jpeg|webp|gif));base64,([A-Za-z0-9+/=\s]+)$/.exec(String(input.dataUrl ?? '').trim());
      if (!match) throw new AppError('worldbuilding/bad-image', '只支持 PNG / JPEG / WebP / GIF 图片的 base64 data URL');
      const extension = match[2] === 'jpeg' ? 'jpg' : match[2];
      const bytes = Buffer.from(match[3], 'base64');
      if (bytes.byteLength === 0) throw new AppError('worldbuilding/bad-image', '图片内容为空');
      if (bytes.byteLength > LIMITS.mapBytes) throw new AppError('worldbuilding/image-too-large', '地图图片不能超过 6MB');
      const dir = join(MEDIA_DIR, world.id);
      await mkdir(dir, { recursive: true });
      const name = `map.${extension}`;
      const temp = join(dir, `${name}.${now()}.tmp`);
      if (world.map.image && world.map.image !== name) {
        await unlink(join(dir, world.map.image)).catch(() => {});
      }
      await writeFile(temp, bytes);
      await rename(temp, join(dir, name));
      const next = structuredClone(world);
      next.map = { ...next.map, image: name };
      const saved = await saveWorldWithConflict(world.id, next, world.rev);
      return { world: saved, rev: saved.rev, image: name, dataUrl: input.dataUrl };
    }
    case 'world/map/remove': {
      const world = await resolveWorldRef(input.id);
      if (world.map.image) await unlink(join(MEDIA_DIR, world.id, world.map.image)).catch(() => {});
      const next = structuredClone(world);
      next.map = { ...next.map, image: '' };
      const saved = await saveWorldWithConflict(world.id, next, world.rev);
      return { world: saved, rev: saved.rev };
    }
    case 'character/images': {
      const world = await resolveWorldRef(input.id);
      const hasFilter = Array.isArray(input.ids);
      const wanted = new Set(hasFilter ? input.ids.map((id) => validId(id, ['ch'])).filter(Boolean) : []);
      const images = {};
      for (const character of world.characters) {
        if (!character.image) continue;
        if (hasFilter && !wanted.has(character.id)) continue;
        const dataUrl = await readCharacterImage(world.id, character.image);
        if (dataUrl) images[character.id] = dataUrl;
      }
      return { images };
    }
    case 'character/image/upload': {
      const world = await resolveWorldRef(input.id);
      const characterId = cleanText(input.characterId, 80);
      if (!validId(characterId, ['ch'])) throw new AppError('worldbuilding/bad-character', '角色 id 不合法');
      const match = /^data:(image\/(png|jpeg|webp|gif));base64,([A-Za-z0-9+/=\s]+)$/.exec(String(input.dataUrl ?? '').trim());
      if (!match) throw new AppError('worldbuilding/bad-image', '只支持 PNG / JPEG / WebP / GIF 图片');
      const extension = match[2] === 'jpeg' ? 'jpg' : match[2];
      const bytes = Buffer.from(match[3], 'base64');
      if (bytes.byteLength === 0) throw new AppError('worldbuilding/bad-image', '图片内容为空');
      if (bytes.byteLength > LIMITS.characterImageBytes) throw new AppError('worldbuilding/image-too-large', '角色图片不能超过 2MB');
      const dir = characterImageDir(world.id);
      await mkdir(dir, { recursive: true });
      const name = `${characterId}-${now().toString(36)}${Math.random().toString(16).slice(2, 6)}.${extension}`;
      const temp = join(dir, `${name}.${now()}.tmp`);
      await writeFile(temp, bytes);
      await rename(temp, join(dir, name));
      return { image: name, dataUrl: input.dataUrl };
    }
    case 'character/image/remove': {
      const world = await resolveWorldRef(input.id);
      const characterId = cleanText(input.characterId, 80);
      if (!validId(characterId, ['ch'])) throw new AppError('worldbuilding/bad-character', '角色 id 不合法');
      await removeCharacterFiles(world.id, characterId);
      return { removed: true };
    }
    case 'timeline/facts': {
      const world = await resolveWorldRef(input.id);
      return { facts: timelineFacts(world), rev: world.rev };
    }
    case 'timeline/integrate': {
      let world = await resolveWorldRef(input.id);
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const latest = attempt === 0 ? world : await requireWorld(world.id);
        world = latest;
        const result = integrateTimelineLocal(latest);
        if (!result.applied.length) {
          return { world: latest, rev: latest.rev, state: await getState(), applied: [], warnings: [] };
        }
        try {
          const saved = await saveWorldWithConflict(latest.id, result.world, latest.rev);
          return { world: saved, rev: saved.rev, state: await getState(), applied: result.applied, warnings: [] };
        } catch (error) {
          if (error.code !== 'worldbuilding/conflict' || attempt === 2) throw error;
        }
      }
      throw new AppError('worldbuilding/conflict', '世界观刚被其他操作修改，请重试');
    }
    case 'ai/timeline':
      return integrateTimelineAi(ctx, input, signal);
    case 'ai/generate':
      return generateWorld(ctx, input, signal);
    case 'ai/import':
      return importWorld(ctx, input, signal);
    case 'ai/chat':
      return chatWorld(ctx, input, signal);
    case 'export': {
      const world = await resolveWorldRef(input.id);
      const format = ['txt', 'markdown', 'json'].includes(input.format) ? input.format : 'txt';
      const result = exportWorld(world, format, Boolean(input.includeChat));
      return { ...result, format, worldId: world.id };
    }
    case 'world/field': {
      const world = await resolveWorldRef(input.id);
      return { value: sectionWorld(world, typeof input.section === 'string' ? input.section : 'overview') };
    }
    default:
      throw new AppError('worldbuilding/unknown-endpoint', `未知接口：${endpoint}`);
  }
}

/* --------------------------------------------------------------- 本地 HTTP */

function sendJson(res, status, payload) {
  if (res.writableEnded) return;
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > API_BODY_LIMIT) throw new Error('请求体过大');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new Error('请求体不是合法 JSON');
  }
}

async function executeEndpoint(ctx, endpoint, payload, signal) {
  try {
    const value = await route(ctx, endpoint, payload, signal);
    return { ok: true, value };
  } catch (error) {
    const code = error?.code && typeof error.code === 'string' ? error.code : 'worldbuilding/failure';
    const message = error?.message ? String(error.message) : '世界观工坊操作失败';
    const details = error?.details && typeof error.details === 'object' ? error.details : {};
    if (!(error instanceof AppError) && !(error instanceof ModelError)) {
      ctx.logger?.warn?.(`[worldbuilding] ${endpoint}: ${message}`);
    }
    return { ok: false, error: { code, message, details } };
  }
}

/* ------------------------------------------------------------------- 应用 */

export function apply(ctx) {
  const apiRoute = {
    kind: 'prefix',
    path: API_PREFIX,
    async handler(req, res) {
      try {
        const url = new URL(req.url || '/', 'http://localhost');
        const allowedPath = url.pathname === API_PATH || url.pathname === `${API_PATH}/`;
        if (!allowedPath) {
          sendJson(res, 404, { ok: false, error: { code: 'worldbuilding/not-found', message: '未知接口', details: {} } });
          return;
        }
        if (req.method === 'OPTIONS') {
          res.writeHead(204, { 'cache-control': 'no-store' });
          res.end();
          return;
        }
        if (req.method !== 'POST') {
          res.writeHead(405, { 'content-type': 'text/plain; charset=utf-8', allow: 'POST' });
          res.end('method not allowed');
          return;
        }
        if (typeof ctx.connection?.requestRejection === 'function') {
          const rejection = ctx.connection.requestRejection(req);
          if (rejection !== undefined) {
            res.writeHead(rejection, { 'content-type': 'text/plain; charset=utf-8' });
            res.end(rejection === 401 ? 'unauthorized' : 'forbidden');
            return;
          }
        }
        let body;
        try {
          body = await readJsonBody(req);
        } catch (error) {
          sendJson(res, 400, { ok: false, error: { code: 'worldbuilding/bad-body', message: error?.message || '请求体错误', details: {} } });
          return;
        }
        const action = typeof body.action === 'string' ? body.action : (url.searchParams.get('action') || 'state');
        const payload = body.payload && typeof body.payload === 'object' ? body.payload : body;
        const controller = new AbortController();
        const onClose = () => { if (!res.writableEnded) controller.abort(); };
        res.on('close', onClose);
        try {
          const result = await executeEndpoint(ctx, action, payload, controller.signal);
          sendJson(res, 200, result);
        } finally {
          res.off('close', onClose);
        }
      } catch (error) {
        sendJson(res, 500, {
          ok: false,
          error: { code: 'worldbuilding/transport', message: error?.message || '本地接口错误', details: {} },
        });
      }
    },
  };

  ctx.effect(() => ctx.webServer.register(apiRoute), 'worldbuilding: /worldbuilding/api');

  ctx.inject(['tools'], (toolCtx) => {
    for (const definition of [toolList(), toolRead(), toolUpdate(), toolCreate()]) {
      toolCtx.effect(() => toolCtx.tools.register(definition), `worldbuilding: tool ${definition.name}`);
    }
  });

  ctx.inject(['systemPrompt'], (promptCtx) => {
    const baseOrder = (() => {
      try {
        return promptCtx.systemPrompt.getSectionOrder('TOOL_REPORT') + 10;
      } catch {
        return 2910;
      }
    })();
    promptCtx.effect(() => promptCtx.systemPrompt.section({
      name: 'worldbuilding',
      order: baseOrder,
      text: () => worldbuildingPromptSection(),
    }), 'worldbuilding: prompt section');
  });

  void refreshPromptCache();
}

export const internal = {
  normalizeWorld,
  sortEvents,
  parseYear,
  applyChanges,
  fillMissing,
  replaceWorldContent,
  exportWorld,
  compactWorld,
  parseModelJson,
  completenessOf,
  countsOf,
  entryFromData,
  DATA_DIR,
};
