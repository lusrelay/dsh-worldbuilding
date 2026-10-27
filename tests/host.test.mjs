/**
 * 世界观工坊 Host 离线自测：临时 DSH_HOME、桩模型，用真实 RPC handler 跑完整业务流程。
 * 运行：node tests/host.test.mjs
 */
import { mkdtempSync } from 'node:fs';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TEST_HOME = mkdtempSync(join(tmpdir(), 'wb-host-'));
process.env.DSH_HOME = TEST_HOME;
if (!TEST_HOME.startsWith(tmpdir())) throw new Error('测试必须运行在临时目录');
console.log(`临时 DSH_HOME：${TEST_HOME}`);

const { apply, internal } = await import('../index.js');

let rpcHandler = null;
let modelReply = '';
const tools = [];
let promptSection = null;

function fakeStream() {
  const text = modelReply;
  return (async function* stream() {
    yield { type: 'text-delta', index: 0, text };
    yield { type: 'finish', reason: { kind: 'stop' } };
  })();
}

const toolsService = { register(definition) { tools.push(definition); return () => {}; } };
const systemPromptService = {
  section(section) { promptSection = section; return () => {}; },
  getSectionOrder() { return 2900; },
};
const ctx = {
  tools: toolsService,
  systemPrompt: systemPromptService,
  connection: {
    rpc: {
      handle(channel, handler) {
        if (channel !== '/worldbuilding') throw new Error(`unexpected channel ${channel}`);
        rpcHandler = handler;
        return () => {};
      },
    },
  },
  inject(_deps, callback) {
    callback(this);
    return () => {};
  },
  get(name) {
    if (name === 'llm') return { stream: fakeStream };
    if (name === 'agentDefaultModel') return { currentSelection: () => ({ provider: 'stub', model: 'stub-model' }) };
    return undefined;
  },
  effect(effect) {
    const dispose = effect();
    return typeof dispose === 'function' ? dispose : () => {};
  },
  logger: { warn() {} },
};

apply(ctx);
if (!rpcHandler) throw new Error('RPC handler 没有注册');
if (tools.length !== 4) throw new Error(`应注册 4 个工具，实际 ${tools.length}`);
console.log(`已注册工具：${tools.map((tool) => tool.name).join(', ')}`);

let failures = 0;
function check(name, condition, extra) {
  if (condition) console.log(`  ✓ ${name}`);
  else {
    failures += 1;
    console.log(`  ✗ ${name}${extra === undefined ? '' : ` — ${JSON.stringify(extra).slice(0, 500)}`}`);
  }
}

async function rpc(endpoint, payload = {}) {
  const result = await rpcHandler(endpoint, payload, new AbortController().signal, {});
  if (!result.ok) {
    const error = new Error(result.error.message);
    error.code = result.error.code;
    error.details = result.error.details;
    throw error;
  }
  return result.value;
}

async function rpcError(endpoint, payload = {}) {
  const result = await rpcHandler(endpoint, payload, new AbortController().signal, {});
  return result.ok ? null : result.error;
}

const worldFiles = () => join(TEST_HOME, 'worldbuilding', 'worlds');

/* --------------------------------------------------------------- 基础流程 */

console.log('\n[1] 空状态与新建');
let state = await rpc('state');
check('初始没有世界观', state.worlds.length === 0 && state.activeId === null, state);
const created = await rpc('world/create', { name: '灰烬群岛' });
const worldId = created.world.id;
check('新建返回 id 与 rev', Boolean(worldId) && created.rev === 1, { worldId, rev: created.rev });
check('默认名称正确', created.world.name === '灰烬群岛', created.world.name);
check('新建后激活', created.state.activeId === worldId, created.state);
const fileText = await readFile(join(worldFiles(), `${worldId}.json`), 'utf8');
check('独立 JSON 文件已落盘', fileText.includes('灰烬群岛'));

console.log('\n[2] 保存与事件排序');
let world = (await rpc('world/get', { id: worldId })).world;
let rev = world.rev;
world.name = '灰烬群岛';
world.type = '低魔奇幻';
world.style = '冷峻、潮湿、克制';
world.era = '第四纪元';
world.eraNote = '旧帝国崩塌后的第三十年。';
world.summary = '一片被火山灰覆盖的群岛。';
world.timeline = [
  { name: '第一纪元', span: '开端—大火', description: '群岛形成。' },
  { name: '第四纪元', span: '现在', description: '诸侯割据。' },
];
world.settings = [
  { title: '灰潮', content: '每月一次，会吞掉没有灯塔的港口。' },
  { title: '誓约', content: '一旦立誓，违背者会被海水记恨。' },
];
world.composition = [
  { title: '绞索海峡', content: '群岛之间唯一可通航的水道。' },
  { title: '灯塔议会', content: '名义上的共主。' },
];
world.events = [
  { time: '第四纪元 1200 年', title: '白塔焚毁', description: '议会大灯塔被烧，顾青梧在火场失踪。', impact: '航运失去统一历法。' },
  { time: '纪元前 300 年', title: '第一次灰潮', description: '三个港口消失。', impact: '人们开始修建灯塔。' },
  { time: '第四纪元 50 年', title: '绞索条约', description: '诸侯划定海峡。', impact: '形成今天的边界。' },
];
world.characters = [
  {
    name: '顾青梧', role: '主角', identity: '白塔最后的守夜人', description: '失忆的年轻守夜人，能听懂灯语。',
    timeline: [{ time: '第四纪元 1190 年', title: '登上白塔', description: '被老守夜人收养。' }],
    relations: [{ target: '裴照', type: '敌对', note: '怀疑对方参与了焚塔。' }],
  },
  { name: '裴照', role: '反派', identity: '议会执灯人', species: '人类', description: '掌握灯契签发权的野心家。' },
];
const saved = await rpc('world/save', { id: worldId, world, rev });
rev = saved.rev;
check('保存 rev 递增', saved.rev === 2, saved.rev);
check('事件按时间升序', saved.world.events.map((event) => event.title).join('|') === '第一次灰潮|绞索条约|白塔焚毁', saved.world.events.map((event) => event.title));
check('世界类型写入', saved.world.type === '低魔奇幻');
check('保存后完整度 > 80', internal.completenessOf(saved.world) >= 80, internal.completenessOf(saved.world));
check('角色写入并保留', saved.world.characters.length === 2 && saved.world.characters[0].name === '顾青梧', saved.world.characters.map((item) => item.name));
check('角色关系按姓名解析成 id', saved.world.characters[0].relations[0]?.targetId === saved.world.characters[1].id, saved.world.characters[0].relations);
check('角色时间点保留', saved.world.characters[0].timeline[0]?.title === '登上白塔');

console.log('\n[3] 冲突检测');
const stale = await rpcError('world/save', { id: worldId, world: saved.world, rev: 1 });
check('旧 rev 被拒绝', stale?.code === 'worldbuilding/conflict', stale);

console.log('\n[4] 导出三种格式');
const txt = await rpc('export', { id: worldId, format: 'txt' });
check('纯文本包含标题和事件', txt.text.includes('《灰烬群岛》') && txt.text.includes('白塔焚毁'));
check('纯文本文件名', txt.filename.endsWith('.txt'), txt.filename);
check('纯文本事件有顺序', txt.text.indexOf('第一次灰潮') < txt.text.indexOf('白塔焚毁'));
const md = await rpc('export', { id: worldId, format: 'markdown' });
check('Markdown 标题层级', md.text.startsWith('# 灰烬群岛') && md.text.includes('## 重大事件'));
const json = await rpc('export', { id: worldId, format: 'json' });
const parsed = JSON.parse(json.text);
check('JSON 可解析且不含内部 aiChat', parsed.name === '灰烬群岛' && parsed.aiChat === undefined);
check('JSON 含事件与设定', parsed.events.length === 3 && parsed.settings.length === 2);

/* --------------------------------------------------------------- Agent 工具 */

console.log('\n[5] Agent 工具');
const listTool = tools.find((tool) => tool.name === 'worldbuilding_list');
const listValue = await listTool.execute({}, {});
check('列表工具看到世界', listValue.worlds.length === 1 && listValue.activeId === worldId);
const readTool = tools.find((tool) => tool.name === 'worldbuilding_read');
const readValue = await readTool.execute({ section: 'events' }, {});
check('读取工具返回事件 JSON', readValue.content.includes('白塔焚毁'));
const updateTool = tools.find((tool) => tool.name === 'worldbuilding_update');
const updateValue = await updateTool.execute({
  changes: [
    { target: 'event', action: 'add', data: { time: '第四纪元 1211 年', title: '雾港沉没', description: '灰潮越过外堤。', impact: '议会失去最大港口。' } },
    { target: 'composition', action: 'add', data: { title: '雾港', content: '曾经最繁忙的港口。' } },
    { target: 'summary', action: 'set', text: '一片被火山灰覆盖的群岛，灯塔是唯一的秩序。' },
  ],
}, {});
check('工具写入事件与构成', updateValue.events === 4 && updateValue.composition === 3, updateValue);
const readAfter = await readTool.execute({}, {});
check('工具写入后事件按时间排最后', (() => {
  const data = JSON.parse(readAfter.content);
  return data.events.at(-1).title === '雾港沉没';
})(), readAfter.content.slice(0, 200));
const createTool = tools.find((tool) => tool.name === 'worldbuilding_create');
const createdByTool = await createTool.execute({ name: '第二世界', type: '科幻' }, {});
check('工具新建世界并激活', createdByTool.name === '第二世界' && createdByTool.activeId === createdByTool.id);
state = await rpc('state');
check('现在有两个世界', state.worlds.length === 2, state.worlds.map((item) => item.name));

/* ------------------------------------------------------------------- AI */

console.log('\n[6] AI 一次性生成');
modelReply = JSON.stringify({
  name: '潮汐王国',
  type: '高魔奇幻',
  style: '华丽、潮湿、带有宫廷阴谋',
  summary: '潮汐王国建立在会呼吸的珊瑚之上。',
  era: '潮历九百年',
  eraNote: '王权衰微，教会与商会争夺潮汐权柄。',
  timeline: [{ name: '涨潮纪', span: '潮历元年—六百年', description: '王国统一。' }],
  events: [
    { time: '潮历 800 年', title: '王都沉没', description: '旧王都陷入海底。', impact: '迁都。' },
    { time: '潮历 300 年', title: '珊瑚誓约', description: '第一代国王与海灵立约。', impact: '确立潮汐法术。' },
  ],
  composition: [{ title: '珊瑚王都', content: '一座活着的城市。' }],
  settings: [{ title: '潮汐法术', content: '只能在涨潮时施法，退潮时反噬。' }],
  map: { notes: '三座环礁围成内海。', markers: [{ name: '王都', x: 0.4, y: 0.6, note: '珊瑚王都' }] },
  tags: ['海洋', '宫廷'],
  characters: [
    { name: '潮汐女王', role: '主角', identity: '珊瑚王座的持有者', species: '潮灵', nonHuman: true, description: '与海灵立约的年轻女王，正在失去听潮的能力。', timeline: [{ time: '潮历 812 年', title: '加冕', description: '在内海王都加冕。' }], relations: [{ target: '潮汐主教', type: '敌对', note: '教会认为女王与海灵的契约不合法。' }] },
    { name: '潮汐主教', role: '反派', identity: '潮汐教会领袖', description: '掌握潮汐教义解释权的老人。' },
  ],
});
const generated = await rpc('ai/generate', { prompt: '一个建立在珊瑚上的潮汐王国', mode: 'new', worldName: '潮汐王国' }, new AbortController().signal);
check('生成新世界', generated.world.name === '潮汐王国' && generated.state.worlds.length === 3, generated.world.name);
check('生成事件按时间排序', generated.world.events.map((event) => event.title).join('|') === '珊瑚誓约|王都沉没', generated.world.events.map((event) => event.title));
check('生成地图标注', generated.world.map.markers.length === 1 && generated.world.map.markers[0].name === '王都');
check('生成重要角色', generated.world.characters.length === 2 && generated.world.characters[0].name === '潮汐女王', generated.world.characters.map((item) => item.name));
check('非人类物种保留', generated.world.characters[0].species === '潮灵' && generated.world.characters[0].nonHuman === true);
check('生成角色关系按姓名解析', generated.world.characters[0].relations[0]?.targetId === generated.world.characters[1].id, generated.world.characters[0].relations);

console.log('\n[7] AI 对话补充');
modelReply = JSON.stringify({
  reply: '已把「潮汐议会」加入主要构成，并补了一条 812 年的政变事件。',
  changes: [
    { target: 'composition', action: 'add', data: { title: '潮汐议会', content: '由七位潮汐领主组成。' } },
    { target: 'event', action: 'add', data: { time: '潮历 812 年', title: '七领主政变', description: '议会夺取王权。', impact: '国王成为象征。' } },
    { target: 'character', action: 'add', data: { name: '潮汐商会会长', role: '剧情 NPC', identity: '内海商会会长', npc: true, description: '在政变中站错队的商人。', relations: [{ target: '潮汐女王', type: '盟友', note: '暗中为女王提供资金。' }] } },
  ],
});
const chat1 = await rpc('ai/chat', { id: generated.world.id, message: '补一个潮汐议会，还有 812 年的政变' });
check('对话返回 reply', chat1.reply.includes('潮汐议会'), chat1.reply);
check('对话应用了三个变更', chat1.applied.length === 3, chat1.applied);
check('对话新增角色并解析关系', chat1.world.characters.length === 3 && chat1.world.characters[2].relations[0]?.targetId === chat1.world.characters[0].id, chat1.world.characters.map((item) => item.name));
check('对话写入 aiChat', chat1.world.aiChat.length === 2, chat1.world.aiChat);
check('对话新增事件已排序', chat1.world.events.some((event) => event.title === '七领主政变'));
modelReply = JSON.stringify({ reply: '潮汐法术在退潮时反噬，越强的法术代价越大。', changes: [] });
const chat2 = await rpc('ai/chat', { id: generated.world.id, message: '潮汐法术有什么限制？' });
check('问答不修改世界', chat2.applied.length === 0 && chat2.world.events.length === chat1.world.events.length);
check('问答仍追加历史', chat2.world.aiChat.length === 4, chat2.world.aiChat.length);

console.log('\n[8] AI 导入通用格式');
modelReply = JSON.stringify({
  name: '银月联邦',
  type: '科幻',
  summary: '月球背面的城邦联合体。',
  era: '静海纪',
  eraNote: '地月战争后的重建期。',
  timeline: [{ name: '静海纪', span: '现在', description: '联邦成立。' }],
  events: [{ time: '静海纪 12 年', title: '联邦宪章', description: '十二城邦签约。', impact: '结束内战。' }],
  composition: [{ title: '月背城邦', content: '十二座环形山城市。' }],
  settings: [{ title: '真空法', content: '任何人在真空中不得被剥夺氧气。' }],
  map: { notes: '月背环形山链。', markers: [] },
  characters: [{ name: '静海议长', role: '重要配角', identity: '联邦议长', description: '主持十二城邦签约。', timeline: [{ time: '静海纪 12 年', title: '签署宪章', description: '代表静海城邦签字。' }] }],
});
const imported = await rpc('ai/import', { text: '# 银月联邦\n\n月球背面的十二座城邦……', mode: 'new' });
check('导入生成新世界', imported.world.name === '银月联邦');
check('导入事件写入', imported.world.events[0].title === '联邦宪章');
check('导入角色写入', imported.world.characters.length === 1 && imported.world.characters[0].name === '静海议长');
check('导入后共有 4 个世界', imported.state.worlds.length === 4, imported.state.worlds.length);

console.log('\n[9] 世界地图');
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lw3JXwAAAABJRU5ErkJggg==';
const uploaded = await rpc('world/map/upload', { id: generated.world.id, dataUrl: png });
check('地图图片保存', uploaded.world.map.image === 'map.png' && uploaded.dataUrl === png, uploaded.world.map);
const mapData = await rpc('world/map', { id: generated.world.id });
check('地图图片读回', mapData.dataUrl.startsWith('data:image/png;base64,'));
const removedMap = await rpc('world/map/remove', { id: generated.world.id });
check('地图图片移除', removedMap.world.map.image === '');

console.log('\n[9b] 角色工具、图片与时间轴');
const charTool = await updateTool.execute({
  world: worldId,
  changes: [
    { target: 'character', action: 'add', data: { name: '雾港女王', role: '重要配角', identity: '走私者联盟首领', description: '在雾港沉没后接管外海航道。', timeline: [{ time: '第四纪元 1215 年', title: '加冕' }], relations: [{ target: '顾青梧', type: '竞争', note: '争夺白塔灯谱。' }] } },
    { target: 'characterTimeline', action: 'add', data: { characterId: '雾港女王', time: '第四纪元 1218 年', title: '灯会现身', description: '在灯会上公开灰契。' } },
    { target: 'characterRelation', action: 'add', data: { fromId: '裴照', target: '雾港女王', type: '合作', note: '互相利用。' } },
  ],
}, {});
check('工具新增角色与时间点', charTool.characters === 3 && charTool.applied.length >= 3, charTool);
const charRead = await readTool.execute({ world: worldId, section: 'characters' }, {});
check('读取角色分区', charRead.content.includes('雾港女王') && charRead.content.includes('顾青梧'));
const axisRead = await readTool.execute({ world: worldId, section: 'axis' }, {});
check('读取时间轴事实', axisRead.content.includes('participants') && axisRead.content.includes('relations'));

const charPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lw3JXwAAAABJRU5ErkJggg==';
let charWorld = (await rpc('world/get', { id: worldId })).world;
const gu = charWorld.characters.find((item) => item.name === '顾青梧');
const charUploaded = await rpc('character/image/upload', { id: worldId, characterId: gu.id, dataUrl: charPng });
check('角色图片上传', charUploaded.image.startsWith(gu.id) && charUploaded.dataUrl === charPng, charUploaded.image);
gu.image = charUploaded.image;
charWorld = (await rpc('world/save', { id: worldId, world: charWorld, rev: charWorld.rev })).world;
const imageMap = await rpc('character/images', { id: worldId, ids: [gu.id] });
check('角色图片读回', imageMap.images[gu.id]?.startsWith('data:image/png;base64,'), Object.keys(imageMap.images));
const imageRemoved = await rpc('character/image/remove', { id: worldId, characterId: gu.id });
check('角色图片移除', imageRemoved.removed === true);

const localAxis = await rpc('timeline/integrate', { id: worldId });
const guAfter = localAxis.world.characters.find((item) => item.name === '顾青梧');
const whiteEvent = localAxis.world.events.find((event) => event.title === '白塔焚毁');
check('本地时间轴整合有变更', localAxis.applied.length > 0, localAxis.applied);
check('事件文本提到的角色被关联', guAfter.eventIds.includes(whiteEvent.id), guAfter.eventIds);
check('角色时间轴补出参与事件', guAfter.timeline.some((point) => point.eventId === whiteEvent.id), guAfter.timeline.map((point) => point.title));

const pei = localAxis.world.characters.find((item) => item.name === '裴照');
modelReply = JSON.stringify({
  reply: '已补齐裴照在焚塔夜的经历与旧识关系。',
  characters: [{
    id: pei.id,
    eventIds: [whiteEvent.id],
    timeline: [{ time: '第四纪元 1200 年', title: '焚塔夜', description: '裴照在火场外签发最后的灯契。', eventId: whiteEvent.id }],
    relations: [{ targetId: guAfter.id, type: '旧识', note: '两人曾在白塔共事。' }],
  }],
  notes: [],
});
const aiAxis = await rpc('ai/timeline', { id: worldId });
const peiAfter = aiAxis.world.characters.find((item) => item.name === '裴照');
check('AI 时间轴整合新增事实', aiAxis.applied.length > 0, aiAxis.applied);
check('AI 关联参与事件', peiAfter.eventIds.includes(whiteEvent.id));
check('AI 新增角色关系', peiAfter.relations.some((relation) => relation.targetId === guAfter.id && relation.type === '旧识'), peiAfter.relations);

const characterJson = await rpc('export', { id: worldId, format: 'json' });
const characterParsed = JSON.parse(characterJson.text);
check('导出 JSON 包含角色', characterParsed.characters?.length === 3, characterParsed.characters?.length);
check('导出 JSON 包含角色关系', characterParsed.characters?.find((item) => item.name === '顾青梧')?.relations?.length > 0);
const characterMd = await rpc('export', { id: worldId, format: 'markdown' });
check('导出 Markdown 包含角色', characterMd.text.includes('## 重要角色') && characterMd.text.includes('顾青梧'));
const characterTxt = await rpc('export', { id: worldId, format: 'txt' });
check('导出纯文本包含角色', characterTxt.text.includes('【重要角色】') && characterTxt.text.includes('雾港女王'));

console.log('\n[10] 多世界隔离与切换');
const first = await rpc('world/get', { id: worldId });
check('另一个世界未被 AI 修改', first.world.events.length === 4, first.world.events.length);
await rpc('world/activate', { id: worldId });
state = await rpc('state');
check('切换激活世界', state.activeId === worldId);
check('系统提示词包含当前世界', typeof promptSection.text === 'function' && promptSection.text().includes('灰烬群岛'), promptSection.text());
const deleted = await rpc('world/delete', { id: createdByTool.id });
check('删除世界', deleted.state.worlds.length === 3 && !deleted.state.worlds.some((item) => item.id === createdByTool.id));

console.log('\n[11] 解析容错与补全');
const parsedFence = internal.parseModelJson('```json\n{"a":1}\n```', 'test');
check('解析代码围栏', parsedFence.a === 1);
const parsedTruncated = internal.parseModelJson('{"name":"残稿","events":[{"title":"甲"}', 'test');
check('解析截断 JSON', parsedTruncated.name === '残稿' && Array.isArray(parsedTruncated.events));
const filled = internal.fillMissing(
  internal.normalizeWorld({ name: '已有', type: '已填', events: [{ time: '1 年', title: '旧事件' }] }),
  { name: '不该覆盖', summary: '补上的总览', events: [{ time: '2 年', title: '新事件' }], composition: [{ title: '补的构成', content: '内容' }] },
);
check('补全不覆盖已有类型', filled.type === '已填');
check('补全保留旧事件并追加', filled.events.length === 2 && filled.summary === '补上的总览');

console.log('\n[12] 清理');
await rm(TEST_HOME, { recursive: true, force: true });
check('临时目录已清理', true);

console.log(`\n${failures === 0 ? '全部通过' : `${failures} 项失败`}`);
if (failures > 0) process.exitCode = 1;
