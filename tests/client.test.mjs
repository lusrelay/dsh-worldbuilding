/**
 * 浏览器半身（client.js）离线渲染冒烟测试。
 * 用最小 React 垫片执行整页与各分页组件，检查槽位注册与默认分支不抛错。
 * 运行：node tests/client.test.mjs
 */
import { readFile } from 'node:fs/promises';

let captured = null;
const fakeReact = {
  Fragment: Symbol.for('react.fragment'),
  createElement(type, props, ...children) {
    const base = { ...(props || {}) };
    if (children.length > 0) base.children = children.flat(Infinity);
    else if (!('children' in base)) base.children = undefined;
    return { type, props: base };
  },
  useState(initial) {
    return [typeof initial === 'function' ? initial() : initial, () => {}];
  },
  useEffect() {},
  useRef(value) {
    return { current: value ?? null };
  },
  useCallback(fn) {
    return fn;
  },
  useMemo(fn) {
    return fn();
  },
};

globalThis.window = {
  innerWidth: 420,
  innerHeight: 900,
  __ModuleLoader__: {
    load({ id, factory }) {
      captured = {
        id,
        module: factory((name) => {
          if (name === 'react') return fakeReact;
          throw new Error(`unexpected require: ${name}`);
        }),
      };
    },
  },
};

let source = await readFile(new URL('../client.js', import.meta.url), 'utf8');
const injection = `    globalThis.__WB__ = { WorldbuildingPage, Header, EmptyState, OverviewPanel, TypePanel, TimelinePanel, EventsPanel, CompositionPanel, SettingsPanel, MapPanel, AiPanel, CreateDialog, GenerateDialog, ImportDialog, ExportDialog, EntryDialog, ConfirmDialog, RenameDialog, countsOfClient, completenessOfClient, parseYear, sortEventsClient };\n    return { inject, apply };`;
if (!source.includes('    return { inject, apply };')) throw new Error('找不到模块导出锚点');
source = source.replace('    return { inject, apply };', injection);
new Function('window', `${source}`)(globalThis.window);

if (!captured || captured.id !== '@local/dsh-worldbuilding') throw new Error('模块 id 不正确');

const registered = [];
captured.module.apply({
  effect(fn) { fn(); return () => {}; },
  locale: { register() { return () => {}; } },
  slots: {
    inject(key, callback) { callback(); },
    register(options, component) { registered.push({ key: options.name, options, component }); return () => {}; },
  },
  connection: { rpc: { call: async () => ({ ok: true, value: {} }) } },
});

let failures = 0;
function check(name, condition, extra) {
  if (condition) console.log(`  ✓ ${name}`);
  else {
    failures += 1;
    console.log(`  ✗ ${name}${extra === undefined ? '' : ` — ${JSON.stringify(extra).slice(0, 400)}`}`);
  }
}
function expand(node) {
  if (node === null || node === undefined || node === false || node === true) return null;
  if (Array.isArray(node)) return node.map(expand).flat(Infinity);
  if (typeof node === 'string' || typeof node === 'number') return node;
  if (typeof node.type === 'function') return expand(node.type(node.props));
  return { ...node, props: { ...node.props, children: expand(node.props.children) } };
}
function texts(node, out = []) {
  if (node === null || node === undefined || node === false) return out;
  if (Array.isArray(node)) { node.forEach((item) => texts(item, out)); return out; }
  if (typeof node === 'string' || typeof node === 'number') { out.push(String(node)); return out; }
  if (node.props?.dangerouslySetInnerHTML?.__html) out.push('style');
  texts(node.props?.children, out);
  return out;
}
function render(name, Component, props) {
  try {
    const tree = expand(Component(props));
    const flat = texts(tree).join(' | ');
    console.log(`  ✓ 渲染 ${name}（${flat.length} 字）`);
    return { tree, flat };
  } catch (error) {
    failures += 1;
    console.log(`  ✗ 渲染 ${name} 抛错：${error.message}`);
    console.log(error.stack?.split('\n').slice(0, 5).join('\n'));
    return { tree: null, flat: '' };
  }
}

const W = globalThis.__WB__;
console.log('\n[1] 槽位注册');
check('注册两个槽位', registered.length === 2, registered.map((row) => row.key));
check('main key = worldbuilding', registered.some((row) => row.key === 'main' && row.options.key === 'worldbuilding'));
check('侧栏 id = worldbuilding', registered.some((row) => row.key === 'sidebar.panellist' && row.options.id === 'worldbuilding'));
check('注入 connection', captured.module.inject.includes('connection'));

const world = {
  schema: 'worldbuilding/1',
  id: 'w_1',
  name: '灰烬群岛',
  type: '低魔奇幻',
  style: '冷峻、潮湿、克制',
  era: '第四纪元',
  eraNote: '旧帝国崩塌后的第三十年。',
  summary: '一片被火山灰覆盖的群岛。',
  tags: ['海洋', '宫廷'],
  timeline: [
    { id: 'tl_1', name: '第一纪元', span: '开端—大火', description: '群岛形成。' },
    { id: 'tl_2', name: '第四纪元', span: '现在', description: '诸侯割据。' },
  ],
  events: [
    { id: 'ev_1', time: '纪元前 300 年', title: '第一次灰潮', description: '三个港口消失。', impact: '人们开始修建灯塔。' },
    { id: 'ev_2', time: '第四纪元 1200 年', title: '白塔焚毁', description: '议会大灯塔被烧。', impact: '航运失去统一历法。' },
  ],
  composition: [
    { id: 'cp_1', title: '绞索海峡', content: '群岛之间唯一可通航的水道。' },
    { id: 'cp_2', title: '灯塔议会', content: '名义上的共主。' },
  ],
  settings: [
    { id: 'se_1', title: '灰潮', content: '每月一次，会吞掉没有灯塔的港口。' },
  ],
  map: {
    image: 'map.png',
    notes: '三座环礁围成内海。',
    markers: [{ id: 'mk_1', name: '王都', x: 0.5, y: 0.4, note: '珊瑚脊上的王都' }],
  },
  aiChat: [
    { id: 'msg_1', role: 'user', text: '加一个走私者联盟。', at: 1700000000000, changes: [] },
    { id: 'msg_2', role: 'assistant', text: '已加入走私者联盟。', at: 1700000001000, changes: ['新增构成「走私者联盟」'] },
  ],
  createdAt: 1700000000000,
  updatedAt: 1700000001000,
  rev: 3,
};

const noop = () => {};
const state = {
  worlds: [{ id: 'w_1', name: '灰烬群岛', type: '低魔奇幻', era: '第四纪元', completeness: 89, counts: { events: 2, composition: 2, settings: 1 } }],
  activeId: 'w_1',
  dataDir: '/root/.dsh/worldbuilding',
};

console.log('\n[2] 整页与页头');
const page = render('WorldbuildingPage', W.WorldbuildingPage, { connection: { rpc: { call: async () => ({ ok: true, value: {} }) } } });
check('初始加载态', page.flat.includes('正在打开世界观工坊'), page.flat.slice(0, 120));
const header = render('Header', W.Header, {
  state, world, tab: 'events', setTab: noop, busy: false, onSelect: noop, onNew: noop,
  onGenerate: noop, onImport: noop, onExport: noop, onMenu: noop, saving: false, dirty: false, savedAt: 1700000001000,
});
check('页头包含标题与切换器', header.flat.includes('世界观工坊') && header.flat.includes('灰烬群岛'));
check('页头显示事件计数', header.flat.includes('事件 2'));
check('标签页包含六类内容', ['概览', '世界类型', '时间线', '重大事件', '主要构成', '世界地图', '基本设定', 'AI 助手'].every((label) => header.flat.includes(label)));
render('EmptyState', W.EmptyState, { onCreate: noop, onGenerate: noop, onImport: noop });

console.log('\n[3] 六个内容分页');
const base = { world, mutate: noop, openEntry: noop, removeEntry: noop, moveTimeline: noop, openGenerate: noop, onExport: noop, onGo: noop, savedAt: 1700000001000 };
const overview = render('OverviewPanel', W.OverviewPanel, base);
check('概览显示完整度', overview.flat.includes('完整度'));
check('概览显示总览标签', overview.flat.includes('总览'));
const type = render('TypePanel', W.TypePanel, base);
check('类型页显示预设', type.flat.includes('高魔奇幻') && type.flat.includes('东方仙侠'));
const timeline = render('TimelinePanel', W.TimelinePanel, base);
check('时间线显示当前时代', timeline.flat.includes('第四纪元') && timeline.flat.includes('第一纪元'));
const events = render('EventsPanel', W.EventsPanel, base);
check('事件页按顺序显示', events.flat.indexOf('第一次灰潮') >= 0 && events.flat.indexOf('第一次灰潮') < events.flat.indexOf('白塔焚毁'));
check('事件页显示影响', events.flat.includes('影响'));
const composition = render('CompositionPanel', W.CompositionPanel, base);
check('构成页显示条目', composition.flat.includes('绞索海峡') && composition.flat.includes('灯塔议会'));
const settings = render('SettingsPanel', W.SettingsPanel, base);
check('设定页显示规则', settings.flat.includes('灰潮'));
const map = render('MapPanel', W.MapPanel, { ...base, mapUrl: 'data:image/png;base64,AAAA', uploadMap: noop, removeMap: noop });
check('地图页显示标注', map.flat.includes('王都') && map.flat.includes('地图标注'));

console.log('\n[4] AI 助手');
const ai = render('AiPanel', W.AiPanel, { world, aiInput: '', setAiInput: noop, onSend: noop, pending: '', onCancel: noop, onGenerate: noop, onClearChat: noop });
check('AI 页显示历史消息', ai.flat.includes('加一个走私者联盟') && ai.flat.includes('已加入走私者联盟'));
check('AI 页显示应用变更', ai.flat.includes('新增构成'));
const aiPending = render('AiPanel', W.AiPanel, { world: { ...world, aiChat: [] }, aiInput: '补一条事件', setAiInput: noop, onSend: noop, pending: '补一条事件', onCancel: noop, onGenerate: noop, onClearChat: noop });
check('AI 页显示等待气泡', aiPending.flat.includes('正在读取当前世界观'));

console.log('\n[5] 对话框');
render('CreateDialog', W.CreateDialog, { onClose: noop, onCreate: noop, onGenerate: noop });
const generate = render('GenerateDialog', W.GenerateDialog, { world, initialMode: 'new', initialPrompt: '', onClose: noop, onSubmit: noop });
check('生成对话框含三种模式', generate.flat.includes('新建另一个世界观') && generate.flat.includes('补全当前世界观') && generate.flat.includes('重写当前世界观'));
const importDialog = render('ImportDialog', W.ImportDialog, { world, onClose: noop, onSubmit: noop });
check('导入对话框含合并模式', importDialog.flat.includes('合并进当前世界观'));
const eventDialog = render('EntryDialog', W.EntryDialog, { target: 'event', entry: null, onClose: noop, onSave: noop });
check('事件对话框含影响字段', eventDialog.flat.includes('长期影响'));
const markerDialog = render('EntryDialog', W.EntryDialog, { target: 'marker', entry: world.map.markers[0], onClose: noop, onSave: noop });
check('标注对话框含坐标', markerDialog.flat.includes('横向位置') && markerDialog.flat.includes('纵向位置'));
render('ConfirmDialog', W.ConfirmDialog, { modal: { title: '删除？', description: '不可撤销', confirmText: '删除', danger: true, onConfirm: noop }, onClose: noop });
render('RenameDialog', W.RenameDialog, { world, onClose: noop, onRename: noop });
const exportDialog = render('ExportDialog', W.ExportDialog, { world, request: async () => ({ text: '示例', filename: 'x.txt', mime: 'text/plain' }), onClose: noop, toast: noop });
check('导出对话框含三种格式', exportDialog.flat.includes('纯文本') && exportDialog.flat.includes('Markdown') && exportDialog.flat.includes('JSON'));

console.log('\n[6] 纯函数');
check('年份解析：纪元前', W.parseYear('纪元前 300 年') === -300);
check('年份解析：纪元内', W.parseYear('第四纪元 1200 年') === 1200);
check('事件排序', W.sortEventsClient([{ time: '第四纪元 1200 年', createdAt: 2 }, { time: '纪元前 300 年', createdAt: 1 }]).map((item) => item.time).join('|') === '纪元前 300 年|第四纪元 1200 年');
check('完整度计算', W.completenessOfClient(world) >= 88, W.completenessOfClient(world));
check('计数', W.countsOfClient(world).events === 2);

console.log(`\n${failures === 0 ? '全部通过' : `${failures} 项失败`}`);
if (failures > 0) process.exitCode = 1;
