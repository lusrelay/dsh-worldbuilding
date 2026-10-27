window.__ModuleLoader__.load({
  id: '@local/dsh-worldbuilding',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useState, useEffect, useRef, useCallback } = React;

    const API_CHANNEL = '/worldbuilding';
    const TABS = [
      { key: 'overview', label: '概览', glyph: '◈' },
      { key: 'type', label: '世界类型', glyph: '✦' },
      { key: 'timeline', label: '时间线', glyph: '⟳' },
      { key: 'events', label: '重大事件', glyph: '⚑' },
      { key: 'composition', label: '主要构成', glyph: '❖' },
      { key: 'map', label: '世界地图', glyph: '⌖' },
      { key: 'settings', label: '基本设定', glyph: '⚖' },
      { key: 'ai', label: 'AI 助手', glyph: '✧' },
    ];
    const TYPE_PRESETS = ['高魔奇幻', '低魔奇幻', '科幻', '赛博朋克', '末日废土', '东方仙侠', '克苏鲁', '蒸汽朋克', '历史架空', '都市异能'];
    const COMPOSITION_PRESETS = ['地理格局', '主要势力', '族群与人口', '经济与贸易', '军事力量', '宗教与信仰', '技术或力量体系', '普通人的日常'];
    const SETTING_PRESETS = ['世界规则', '力量体系', '物理法则', '社会法则', '禁忌与代价', '历史遗留问题'];
    const AI_PROMPTS = [
      '补全缺失或过薄的部分，保持已有设定与专有名词不变。',
      '增加一个与现有势力对立的新势力，并补一条它崛起的历史事件。',
      '增加三条时间上连贯的重大事件，制造一个尚未解决的危机。',
      '检查现有设定之间的冲突，列出问题并给出修改建议。',
    ];
    const CSS = `
.wb-root{--wb-accent:var(--dsw-alias-brand-primary,#4d6bfe);--wb-line:var(--dsw-alias-border-l1,rgba(128,128,128,.2));--wb-line-strong:var(--dsw-alias-border-l2,rgba(128,128,128,.36));--wb-card:var(--dsw-alias-bg-layer-1,rgba(128,128,128,.06));--wb-card-2:var(--dsw-alias-bg-layer-2,rgba(128,128,128,.1));--wb-overlay:var(--dsw-alias-bg-overlay,#fff);--wb-text:var(--dsw-alias-label-primary,#18181b);--wb-dim:var(--dsw-alias-label-secondary,#6b7280);--wb-faint:var(--dsw-alias-label-secondary,#8b93a1);--wb-danger:var(--dsw-alias-state-error-primary,#e5484d);--wb-ok:var(--dsw-alias-state-success-primary,#2f9e63);--wb-warn:var(--dsw-alias-state-warn-primary,#c27c0e);position:relative;height:100%;display:flex;flex-direction:column;overflow:hidden;background:var(--dsw-alias-bg-base,#fff);color:var(--wb-text);font-size:14px;line-height:1.65}
.wb-root *{box-sizing:border-box}
.wb-root ::-webkit-scrollbar{width:8px;height:8px}
.wb-root ::-webkit-scrollbar-thumb{background:var(--wb-line-strong);border-radius:8px}
.wb-head{flex:none;padding:14px clamp(12px,3vw,26px) 0;border-bottom:.5px solid var(--wb-line);background:var(--dsw-alias-bg-base,#fff)}
.wb-headtop{display:flex;align-items:baseline;gap:8px;min-width:0;flex-wrap:wrap}
.wb-title{margin:0;font-size:19px;font-weight:500;line-height:28px;white-space:nowrap;letter-spacing:.01em}
.wb-sub{color:var(--wb-dim);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:44vw}
.wb-headactions{display:flex;gap:6px;align-items:center;margin-left:auto;flex-wrap:wrap}
.wb-headbar{display:flex;align-items:center;gap:8px;margin-top:9px;flex-wrap:wrap}
.wb-select{flex:1 1 220px;min-width:0;height:32px;border-radius:16px;border:.5px solid var(--wb-line-strong);background:var(--wb-card);color:var(--wb-text);font:inherit;font-size:13px;padding:0 28px 0 12px;cursor:pointer;max-width:560px}
.wb-select:focus{outline:none;border-color:var(--wb-accent)}
.wb-save{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--wb-dim);white-space:nowrap}
.wb-savedot{width:7px;height:7px;border-radius:50%;background:var(--wb-ok);flex:none}
.wb-savedot[data-state=dirty]{background:var(--wb-warn)}
.wb-savedot[data-state=saving]{background:var(--wb-accent);animation:wb-pulse 1s infinite}
.wb-tabs{display:flex;gap:2px;margin-top:10px;overflow-x:auto;scrollbar-width:none}
.wb-tabs::-webkit-scrollbar{display:none}
.wb-tab{flex:none;display:inline-flex;align-items:center;gap:6px;border:0;border-bottom:2px solid transparent;background:transparent;color:var(--wb-dim);font:inherit;font-size:13px;line-height:20px;padding:9px 11px;border-radius:9px 9px 0 0;cursor:pointer;white-space:nowrap;transition:background .15s,color .15s}
.wb-tab:hover{background:var(--wb-card);color:var(--wb-text)}
.wb-tab[data-active=true]{color:var(--wb-accent);border-bottom-color:var(--wb-accent)}
.wb-tab-glyph{opacity:.8;font-size:12px}
.wb-tag{flex:none;font-size:10.5px;line-height:16px;padding:0 6px;border-radius:8px;background:var(--wb-card-2);color:var(--wb-dim);font-weight:400;font-variant-numeric:tabular-nums}
.wb-body{flex:1;min-height:0;display:flex;overflow:hidden}
.wb-scroll{flex:1;min-height:0;overflow:auto;padding:16px clamp(12px,2.6vw,26px) 40px;scrollbar-width:thin}
.wb-narrow{max-width:900px;margin:0 auto;width:100%;display:flex;flex-direction:column;gap:12px}
.wb-wide{max-width:1180px;margin:0 auto;width:100%;display:flex;flex-direction:column;gap:12px}
.wb-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:30px;padding:0 12px;border-radius:15px;border:.5px solid var(--wb-line-strong);background:transparent;color:var(--wb-text);font:inherit;font-size:13px;cursor:pointer;white-space:nowrap;transition:background .15s,border-color .15s,opacity .15s}
.wb-btn:hover:not(:disabled){background:var(--wb-card)}
.wb-btn:disabled{opacity:.45;cursor:default}
.wb-btn--primary{background:var(--wb-accent);border-color:transparent;color:#fff;font-weight:500}
.wb-btn--primary:hover:not(:disabled){filter:brightness(1.08);background:var(--wb-accent)}
.wb-btn--ghost{border-color:transparent;color:var(--wb-dim)}
.wb-btn--ghost:hover:not(:disabled){color:var(--wb-text)}
.wb-btn--danger{color:var(--wb-danger);border-color:transparent}
.wb-btn--danger:hover:not(:disabled){background:color-mix(in srgb,var(--wb-danger) 10%,transparent)}
.wb-btn--sm{height:26px;padding:0 10px;font-size:12px;border-radius:13px}
.wb-iconbtn{width:30px;height:30px;padding:0;border-radius:10px;border:.5px solid transparent;background:transparent;color:var(--wb-dim);font:inherit;font-size:15px;line-height:1;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;flex:none}
.wb-iconbtn:hover:not(:disabled){background:var(--wb-card);color:var(--wb-text)}
.wb-iconbtn:disabled{opacity:.4;cursor:default}
.wb-input,.wb-area{width:100%;border:.5px solid var(--wb-line-strong);border-radius:12px;background:var(--wb-card);color:var(--wb-text);font:inherit;font-size:13.5px;line-height:1.6;padding:9px 11px;outline:none;transition:border-color .15s}
.wb-input:focus,.wb-area:focus{border-color:var(--wb-accent)}
.wb-area{resize:vertical;min-height:130px;font-family:inherit}
.wb-mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;line-height:1.7}
.wb-card{border:.5px solid var(--wb-line);border-radius:14px;padding:14px;background:var(--wb-card)}
.wb-card h3{margin:0 0 4px;font-size:14px;font-weight:600;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.wb-card p{margin:0;color:var(--wb-dim);font-size:12.5px;line-height:1.7}
.wb-card--head{display:flex;align-items:flex-start;gap:10px;margin-bottom:10px}
.wb-card--head .wb-card-grow{flex:1;min-width:0}
.wb-sectionhead{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:4px 0 2px}
.wb-sectionhead h3{margin:0;font-size:14px;font-weight:600}
.wb-hint{color:var(--wb-faint);font-size:12px;line-height:1.65}
.wb-field{display:flex;flex-direction:column;gap:5px}
.wb-label{font-size:11.5px;color:var(--wb-faint);letter-spacing:.03em}
.wb-form{display:flex;flex-direction:column;gap:11px}
.wb-formrow{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.wb-grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.wb-inline{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.wb-spacer{flex:1 1 auto}
.wb-chips{display:flex;flex-wrap:wrap;gap:6px}
.wb-chip{display:inline-flex;align-items:center;gap:5px;border:.5px solid var(--wb-line-strong);background:transparent;color:var(--wb-text);font:inherit;font-size:12.5px;line-height:1.5;padding:4px 10px;border-radius:12px;cursor:pointer;transition:background .15s,border-color .15s}
.wb-chip:hover{border-color:var(--wb-accent);background:color-mix(in srgb,var(--wb-accent) 7%,transparent)}
.wb-chip[data-active=true]{border-color:var(--wb-accent);color:var(--wb-accent);background:color-mix(in srgb,var(--wb-accent) 9%,transparent)}
.wb-hero{display:flex;gap:18px;align-items:flex-start;border:.5px solid var(--wb-line);border-radius:16px;padding:18px;background:linear-gradient(135deg,color-mix(in srgb,var(--wb-accent) 8%,transparent),transparent 62%),var(--wb-card)}
.wb-hero-main{flex:1;min-width:0}
.wb-eyebrow{font-size:11px;letter-spacing:.14em;color:var(--wb-faint);text-transform:uppercase}
.wb-hero-name{width:100%;border:0;background:transparent;color:var(--wb-text);font:inherit;font-size:24px;font-weight:600;line-height:1.35;padding:2px 0;outline:none;border-bottom:1px dashed transparent}
.wb-hero-name:focus{border-bottom-color:var(--wb-line-strong)}
.wb-hero-meta{color:var(--wb-dim);font-size:12.5px;margin-top:2px}
.wb-hero-side{flex:0 0 220px;max-width:42%;display:flex;flex-direction:column;gap:8px}
.wb-progress{height:7px;border-radius:6px;background:var(--wb-card-2);overflow:hidden}
.wb-progress > i{display:block;height:100%;border-radius:6px;background:var(--wb-accent);transition:width .3s}
.wb-progress-label{display:flex;justify-content:space-between;font-size:11.5px;color:var(--wb-faint);font-variant-numeric:tabular-nums}
.wb-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(104px,1fr));gap:8px}
.wb-stat{display:flex;flex-direction:column;gap:2px;text-align:left;border:.5px solid var(--wb-line);border-radius:12px;background:var(--wb-card);color:inherit;font:inherit;padding:9px 11px;cursor:pointer}
.wb-stat:hover{border-color:var(--wb-accent)}
.wb-stat b{font-size:18px;font-weight:600;line-height:1.3;font-variant-numeric:tabular-nums}
.wb-stat span{font-size:11.5px;color:var(--wb-faint)}
.wb-check{display:flex;align-items:center;gap:7px;padding:4px 0;font-size:12.5px;color:var(--wb-dim)}
.wb-check b{font-weight:500;color:var(--wb-text);flex:1;min-width:0}
.wb-check[data-done=true] b{color:var(--wb-ok)}
.wb-check-dot{width:14px;height:14px;border-radius:50%;border:.5px solid var(--wb-line-strong);display:inline-flex;align-items:center;justify-content:center;font-size:10px;color:transparent;flex:none}
.wb-check[data-done=true] .wb-check-dot{background:var(--wb-ok);border-color:var(--wb-ok);color:#fff}
.wb-row{display:flex;gap:10px;align-items:flex-start;border:.5px solid var(--wb-line);border-radius:12px;background:var(--wb-card);padding:10px 12px;margin-bottom:8px}
.wb-row:hover{border-color:var(--wb-line-strong)}
.wb-row-main{flex:1;min-width:0}
.wb-row-title{display:flex;align-items:baseline;gap:7px;font-weight:600;font-size:13.5px;line-height:1.5;overflow-wrap:anywhere}
.wb-row-title span{font-weight:400;color:var(--wb-faint);font-size:11.5px;flex:none}
.wb-row-desc{color:var(--wb-dim);font-size:12.5px;line-height:1.7;margin-top:2px;white-space:pre-wrap;overflow-wrap:anywhere}
.wb-row-actions{display:inline-flex;gap:2px;flex:none;align-items:center}
.wb-event{display:grid;grid-template-columns:118px 1fr auto;gap:12px;border:.5px solid var(--wb-line);border-radius:13px;background:var(--wb-card);padding:12px 14px;margin-bottom:9px}
.wb-event:hover{border-color:var(--wb-line-strong)}
.wb-event-time{font-size:11.5px;color:var(--wb-accent);font-variant-numeric:tabular-nums;padding-top:2px;overflow-wrap:anywhere}
.wb-event-title{font-size:14px;font-weight:600;line-height:1.5}
.wb-event-desc{color:var(--wb-dim);font-size:12.5px;line-height:1.75;margin-top:3px;white-space:pre-wrap;overflow-wrap:anywhere}
.wb-impact{margin-top:7px;padding:7px 9px;border-left:2px solid var(--wb-accent);background:color-mix(in srgb,var(--wb-accent) 6%,transparent);border-radius:0 8px 8px 0;font-size:12px;color:var(--wb-dim);line-height:1.65}
.wb-impact b{color:var(--wb-text);font-weight:500}
.wb-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:44px 20px;text-align:center;color:var(--wb-faint)}
.wb-empty-glyph{font-size:30px;opacity:.45;line-height:1}
.wb-empty b{color:var(--wb-dim);font-weight:500;font-size:14px}
.wb-empty p{margin:0;font-size:12.5px;line-height:1.7;max-width:420px}
.wb-loading{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;color:var(--wb-dim);background:var(--dsw-alias-bg-base,#fff)}
.wb-spinner{width:22px;height:22px;border-radius:50%;border:2px solid var(--wb-line-strong);border-top-color:var(--wb-accent);animation:wb-spin .8s linear infinite}
@keyframes wb-spin{to{transform:rotate(360deg)}}
@keyframes wb-pulse{0%,100%{opacity:.4}50%{opacity:1}}
.wb-map{display:flex;flex-direction:column;gap:10px}
.wb-mapframe{position:relative;border:.5px solid var(--wb-line-strong);border-radius:14px;overflow:hidden;background:var(--wb-card);min-height:220px;display:flex;align-items:center;justify-content:center}
.wb-mapimg{display:block;width:100%;height:auto;cursor:crosshair;background:var(--wb-card)}
.wb-mapempty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:44px 20px;text-align:center;color:var(--wb-faint);min-height:220px;width:100%;cursor:pointer;border:1px dashed var(--wb-line-strong);border-radius:12px;background:transparent;font:inherit}
.wb-mapempty:hover{border-color:var(--wb-accent);color:var(--wb-dim)}
.wb-mapempty b{color:var(--wb-dim);font-weight:500}
.wb-marker{position:absolute;transform:translate(-50%,-50%);display:inline-flex;align-items:center;gap:4px;border:0;background:transparent;color:var(--wb-text);font:inherit;font-size:11px;cursor:pointer;padding:2px;max-width:46%;z-index:2}
.wb-marker i{width:13px;height:13px;border-radius:50%;background:var(--wb-accent);border:2px solid #fff;box-shadow:0 0 0 2px color-mix(in srgb,var(--wb-accent) 35%,transparent);flex:none}
.wb-marker span{background:color-mix(in srgb,var(--dsw-alias-bg-base,#fff) 82%,transparent);border:.5px solid var(--wb-line);border-radius:8px;padding:0 5px;line-height:18px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:130px;backdrop-filter:blur(2px)}
.wb-marker:hover i{background:var(--wb-warn)}
.wb-marker:hover span{border-color:var(--wb-accent)}
.wb-mapbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.wb-markerlist{display:flex;flex-direction:column;gap:6px}
.wb-markerrow{display:flex;align-items:center;gap:8px;border:.5px solid var(--wb-line);border-radius:10px;padding:6px 9px;background:var(--wb-card);font-size:12.5px}
.wb-ai{flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden}
.wb-ai-head{flex:none;display:flex;align-items:center;gap:8px;padding:10px clamp(12px,2.6vw,26px);border-bottom:.5px solid var(--wb-line);flex-wrap:wrap;background:var(--dsw-alias-bg-base,#fff)}
.wb-ai-head b{font-size:13.5px;font-weight:600}
.wb-ai-scroll{flex:1;min-height:0;overflow:auto;padding:16px clamp(12px,2.6vw,26px) 8px;scrollbar-width:thin}
.wb-ai-inner{max-width:860px;margin:0 auto;display:flex;flex-direction:column;gap:14px}
.wb-msg{display:flex;flex-direction:column;gap:4px}
.wb-msg--user{align-items:flex-end}
.wb-msg-meta{font-size:10.5px;color:var(--wb-faint)}
.wb-bubble{max-width:84%;background:color-mix(in srgb,var(--wb-accent) 12%,var(--wb-card));border:.5px solid color-mix(in srgb,var(--wb-accent) 20%,transparent);border-radius:14px 14px 4px 14px;padding:9px 13px;white-space:pre-wrap;overflow-wrap:anywhere;font-size:13.5px}
.wb-reply{width:100%;border:.5px solid var(--wb-line);border-radius:14px 14px 14px 4px;background:var(--wb-card);padding:12px 14px;overflow-wrap:anywhere;font-size:13.5px;line-height:1.8;white-space:pre-wrap}
.wb-changes{display:flex;flex-wrap:wrap;gap:5px;margin-top:9px;padding-top:8px;border-top:.5px dashed var(--wb-line)}
.wb-change{font-size:11px;line-height:18px;padding:0 7px;border-radius:8px;background:color-mix(in srgb,var(--wb-ok) 11%,transparent);color:var(--wb-ok);border:.5px solid color-mix(in srgb,var(--wb-ok) 26%,transparent)}
.wb-typing{display:inline-flex;gap:5px;align-items:center;padding:3px 0}
.wb-dot{width:5px;height:5px;border-radius:50%;background:var(--wb-accent);animation:wb-pulse 1.1s infinite ease-in-out}
.wb-dot:nth-child(2){animation-delay:.15s}
.wb-dot:nth-child(3){animation-delay:.3s}
.wb-composer{flex:none;border-top:.5px solid var(--wb-line);padding:10px clamp(12px,2.6vw,26px) 14px;background:var(--dsw-alias-bg-base,#fff)}
.wb-composer-inner{max-width:860px;margin:0 auto;display:flex;flex-direction:column;gap:7px}
.wb-composer-row{display:flex;gap:8px;align-items:flex-end}
.wb-composer textarea{flex:1;min-height:44px;max-height:180px;resize:none;border-radius:14px;border:.5px solid var(--wb-line-strong);background:var(--wb-card);color:var(--wb-text);font:inherit;font-size:13.5px;line-height:1.6;padding:11px 13px;outline:none;font-family:inherit}
.wb-composer textarea:focus{border-color:var(--wb-accent)}
.wb-send{height:44px;padding:0 18px;border-radius:14px}
.wb-composer-tip{font-size:11px;color:var(--wb-faint);display:flex;gap:10px;flex-wrap:wrap}
.wb-cancel{height:44px;border-radius:14px}
.wb-overlay{position:absolute;inset:0;background:rgba(10,12,18,.42);display:flex;align-items:center;justify-content:center;padding:16px;z-index:30;backdrop-filter:blur(2px)}
.wb-modal{width:min(560px,100%);max-height:90%;display:flex;flex-direction:column;background:var(--wb-overlay);color:var(--wb-text);border:.5px solid var(--wb-line);border-radius:16px;box-shadow:0 18px 48px rgba(0,0,0,.28);overflow:hidden}
.wb-modal--wide{width:min(760px,100%)}
.wb-modal-head{flex:none;position:relative;padding:16px 44px 10px 18px;border-bottom:.5px solid var(--wb-line)}
.wb-modal-head h3{margin:0;font-size:15px;font-weight:600}
.wb-modal-head p{margin:4px 0 0;font-size:12px;color:var(--wb-dim);line-height:1.6}
.wb-close{position:absolute;right:10px;top:10px;width:28px;height:28px;border-radius:9px;border:0;background:transparent;color:var(--wb-dim);font:inherit;font-size:20px;line-height:1;cursor:pointer}
.wb-close:hover{background:var(--wb-card);color:var(--wb-text)}
.wb-modal-body{flex:1;min-height:0;overflow:auto;padding:14px 18px}
.wb-modal-foot{flex:none;display:flex;justify-content:flex-end;align-items:center;gap:8px;padding:10px 18px 14px;border-top:.5px solid var(--wb-line);flex-wrap:wrap}
.wb-modal-foot .wb-spacer{min-width:20px}
.wb-radio{display:flex;align-items:flex-start;gap:8px;border:.5px solid var(--wb-line);border-radius:11px;padding:8px 10px;cursor:pointer;background:transparent}
.wb-radio[data-active=true]{border-color:var(--wb-accent);background:color-mix(in srgb,var(--wb-accent) 6%,transparent)}
.wb-radio input{margin-top:3px;accent-color:var(--wb-accent)}
.wb-radio b{display:block;font-size:13px;font-weight:500}
.wb-radio span{display:block;font-size:11.5px;color:var(--wb-dim);line-height:1.55}
.wb-radios{display:flex;flex-direction:column;gap:6px}
.wb-toast{position:absolute;left:50%;bottom:24px;transform:translateX(-50%);max-width:min(560px,88%);background:var(--wb-overlay);color:var(--wb-text);border:.5px solid var(--wb-line-strong);border-radius:12px;padding:9px 14px;font-size:13px;box-shadow:0 10px 30px rgba(0,0,0,.25);z-index:50;display:flex;gap:8px;align-items:center;animation:wb-toast .18s ease-out}
.wb-toast[data-kind=error]{border-color:color-mix(in srgb,var(--wb-danger) 55%,transparent);color:var(--wb-danger)}
@keyframes wb-toast{from{opacity:0;transform:translate(-50%,6px)}to{opacity:1;transform:translate(-50%,0)}}
.wb-busy{position:absolute;inset:0;background:rgba(10,12,18,.32);display:flex;align-items:center;justify-content:center;z-index:45;backdrop-filter:blur(2px)}
.wb-busy-card{width:min(420px,88%);background:var(--wb-overlay);border:.5px solid var(--wb-line-strong);border-radius:16px;padding:20px;box-shadow:0 18px 48px rgba(0,0,0,.28);display:flex;flex-direction:column;gap:10px;align-items:flex-start}
.wb-busy-title{font-size:14px;font-weight:600;display:flex;align-items:center;gap:9px}
.wb-busy-sub{font-size:12px;color:var(--wb-dim);line-height:1.7}
.wb-busy-actions{display:flex;gap:8px;justify-content:flex-end;width:100%}
.wb-menu-mask{position:absolute;inset:0;z-index:55}
.wb-menu{position:absolute;right:14px;top:52px;z-index:56;min-width:190px;background:var(--wb-overlay);border:.5px solid var(--wb-line-strong);border-radius:12px;box-shadow:0 12px 32px rgba(0,0,0,.28);padding:5px;display:flex;flex-direction:column}
.wb-menu-item{text-align:left;border:0;background:transparent;color:var(--wb-text);font:inherit;font-size:13px;padding:9px 10px;border-radius:8px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wb-menu-item:hover:not(:disabled){background:var(--wb-card)}
.wb-menu-item--danger{color:var(--wb-danger)}
.wb-menu-sep{height:1px;background:var(--wb-line);margin:4px 2px}
.wb-quick{display:flex;flex-direction:column;gap:6px;margin-top:8px}
.wb-quick .wb-btn{justify-content:flex-start}
.wb-usage{display:flex;flex-wrap:wrap;gap:4px 10px;font-size:10.5px;color:var(--wb-faint);font-variant-numeric:tabular-nums;margin-top:6px}
.wb-preview{width:100%;min-height:260px;max-height:44vh;resize:vertical;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;line-height:1.7;white-space:pre;overflow:auto}
.wb-overflow{overflow-wrap:anywhere}
@media (max-width:820px){
.wb-head{padding-top:12px}
.wb-headtop{padding-left:40px}
.wb-title{font-size:17px;line-height:26px}
.wb-sub{display:none}
.wb-headactions{margin-left:0;width:100%;justify-content:flex-start;overflow-x:auto;flex-wrap:nowrap;padding-bottom:2px}
.wb-headactions::-webkit-scrollbar{display:none}
.wb-tabs{margin-top:8px}
.wb-tab{padding:8px 9px;font-size:12.5px;border-radius:8px 8px 0 0}
.wb-tab-glyph{display:none}
.wb-hero{flex-direction:column;gap:12px;padding:14px}
.wb-hero-side{flex:1 1 auto;max-width:100%;width:100%}
.wb-grid2,.wb-formrow{grid-template-columns:1fr}
.wb-event{grid-template-columns:1fr;gap:4px}
.wb-event-time{padding-top:0}
.wb-event .wb-actions{justify-self:end}
.wb-scroll{padding:12px 12px 32px}
.wb-stats{grid-template-columns:repeat(3,1fr)}
.wb-stat b{font-size:16px}
.wb-ai-scroll{padding:12px}
.wb-composer{padding:8px 12px 10px}
.wb-bubble{max-width:92%}
.wb-modal{max-height:94%}
}
`;
    /* ------------------------------------------------------------ 小工具 */

    function clone(value) {
      try {
        return structuredClone(value);
      } catch {
        return JSON.parse(JSON.stringify(value));
      }
    }

    function localId(prefix) {
      const bytes = new Uint8Array(8);
      if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
      else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
      return `${prefix}_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
    }

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

    function sortEventsClient(events) {
      return events
        .map((event, index) => ({ event, index, year: parseYear(event.time) }))
        .sort((left, right) => {
          const ly = left.year === null ? Number.POSITIVE_INFINITY : left.year;
          const ry = right.year === null ? Number.POSITIVE_INFINITY : right.year;
          if (ly !== ry) return ly - ry;
          const lc = Number(left.event.createdAt) || 0;
          const rc = Number(right.event.createdAt) || 0;
          if (lc !== rc) return lc - rc;
          return left.index - right.index;
        })
        .map((item) => item.event);
    }

    function countsOfClient(world) {
      return {
        events: world.events.length,
        timeline: world.timeline.length,
        composition: world.composition.length,
        settings: world.settings.length,
        markers: world.map.markers.length,
      };
    }

    function completenessOfClient(world) {
      const checks = [
        Boolean(world.name && world.name !== '未命名世界观'),
        Boolean(world.type),
        Boolean(world.era),
        world.timeline.length > 0,
        world.events.length > 0,
        world.composition.length > 0,
        world.settings.length > 0,
        Boolean(world.map.notes || world.map.image || world.map.markers.length),
        Boolean(world.summary),
      ];
      return Math.round((checks.filter(Boolean).length / checks.length) * 100);
    }

    function formatTime(value) {
      const stamp = Number(value);
      if (!Number.isFinite(stamp)) return '';
      const date = new Date(stamp);
      const pad = (part) => String(part).padStart(2, '0');
      return `${date.getMonth() + 1}月${date.getDate()}日 ${pad(date.getHours())}:${pad(date.getMinutes())}`;
    }

    function splitTags(text) {
      return String(text || '').split(/[，,、;；\n]/).map((tag) => tag.trim()).filter(Boolean).slice(0, 12);
    }

    function readTextFile(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error || new Error('文件读取失败'));
        reader.readAsText(file);
      });
    }

    function readDataUrl(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error || new Error('图片读取失败'));
        reader.readAsDataURL(file);
      });
    }

    async function copyText(text) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        const area = document.createElement('textarea');
        area.value = text;
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        let ok = false;
        try {
          ok = document.execCommand('copy');
        } catch {
          ok = false;
        }
        area.remove();
        return ok;
      }
    }

    function downloadText(text, filename, mime) {
      const blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename || 'world.txt';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1200);
    }

    /* ------------------------------------------------------------ 基础件 */

    function Btn({ variant = '', size = '', className = '', children, ...rest }) {
      const classes = ['wb-btn'];
      if (variant) classes.push(`wb-btn--${variant}`);
      if (size) classes.push(`wb-btn--${size}`);
      if (className) classes.push(className);
      return h('button', { type: 'button', ...rest, className: classes.join(' ') }, children);
    }

    function IconBtn({ label, children, className = '', ...rest }) {
      return h('button', {
        type: 'button',
        className: `wb-iconbtn ${className}`.trim(),
        'aria-label': label,
        title: label,
        ...rest,
      }, children);
    }

    function Field({ label, hint, children }) {
      return h('label', { className: 'wb-field' },
        h('span', { className: 'wb-label' }, label),
        children,
        hint ? h('span', { className: 'wb-hint' }, hint) : null);
    }

    function SectionCard({ title, desc, actions, children, className = '' }) {
      return h('section', { className: `wb-card ${className}`.trim() },
        (title || desc || actions)
          ? h('div', { className: 'wb-card--head' },
            h('div', { className: 'wb-card-grow' },
              title ? h('h3', null, title) : null,
              desc ? h('p', null, desc) : null),
            actions ? h('div', { className: 'wb-inline' }, actions) : null)
          : null,
        children);
    }

    function Progress({ value }) {
      const safe = Math.max(0, Math.min(100, Number(value) || 0));
      return h('div', { className: 'wb-progress', role: 'progressbar', 'aria-valuenow': safe, 'aria-valuemin': 0, 'aria-valuemax': 100 },
        h('i', { style: { width: `${safe}%` } }));
    }

    function Chip({ active = false, onClick, children, ...rest }) {
      return h('button', {
        type: 'button',
        className: 'wb-chip',
        'data-active': active ? 'true' : 'false',
        onClick,
        ...rest,
      }, children);
    }

    function EmptyBlock({ glyph = '◇', title, text, action }) {
      return h('div', { className: 'wb-empty' },
        h('div', { className: 'wb-empty-glyph' }, glyph),
        title ? h('b', null, title) : null,
        text ? h('p', null, text) : null,
        action || null);
    }

    function Loading() {
      return h('div', { className: 'wb-loading' },
        h('div', { className: 'wb-spinner' }),
        h('span', null, '正在打开世界观工坊…'));
    }

    function Toast({ toast }) {
      if (!toast) return null;
      return h('div', { className: 'wb-toast', 'data-kind': toast.kind || 'ok', role: 'status' },
        h('span', null, toast.text));
    }

    function BusyOverlay({ busy, onCancel }) {
      const [elapsed, setElapsed] = useState(0);
      useEffect(() => {
        if (!busy) return undefined;
        setElapsed(0);
        const started = busy.start || Date.now();
        const timer = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
        return () => clearInterval(timer);
      }, [busy]);
      return h('div', { className: 'wb-busy', role: 'status', 'aria-live': 'polite' },
        h('div', { className: 'wb-busy-card' },
          h('div', { className: 'wb-busy-title' }, h('span', { className: 'wb-spinner' }), busy.label || '正在处理…'),
          h('div', { className: 'wb-busy-sub' }, `已用 ${elapsed}s。模型思考时可能不会立刻返回文字，请稍等；可以随时取消。`),
          h('div', { className: 'wb-busy-actions' },
            h(Btn, { size: 'sm', onClick: onCancel }, '取消'))));
    }

    function Modal({ title, description, children, footer, onClose, wide = false }) {
      useEffect(() => {
        const onKey = (event) => {
          if (event.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
      }, [onClose]);
      return h('div', {
        className: 'wb-overlay',
        onMouseDown: (event) => { if (event.target === event.currentTarget) onClose(); },
      },
      h('div', {
        className: `wb-modal${wide ? ' wb-modal--wide' : ''}`,
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': title,
      },
      h('div', { className: 'wb-modal-head' },
        h('h3', null, title),
        description ? h('p', null, description) : null,
        h('button', { type: 'button', className: 'wb-close', 'aria-label': '关闭', onClick: onClose }, '×')),
      h('div', { className: 'wb-modal-body' }, children),
      footer ? h('div', { className: 'wb-modal-foot' }, footer) : null));
    }

    function Radio({ active, onSelect, title, description }) {
      return h('label', { className: 'wb-radio', 'data-active': active ? 'true' : 'false' },
        h('input', { type: 'radio', checked: active, onChange: onSelect }),
        h('span', null, h('b', null, title), description ? h('span', null, description) : null));
    }

    /* --------------------------------------------------------------- 页头 */

    function Header({ state, world, tab, setTab, busy, onSelect, onNew, onGenerate, onImport, onExport, onMenu, saving, dirty, savedAt }) {
      const counts = world ? countsOfClient(world) : null;
      const status = dirty ? 'dirty' : saving ? 'saving' : 'saved';
      const saveText = dirty ? '有未保存的修改' : saving ? '保存中…' : savedAt ? `已保存 ${formatTime(savedAt)}` : '已同步';
      return h('header', { className: 'wb-head' },
        h('div', { className: 'wb-headtop' },
          h('h1', { className: 'wb-title' }, '世界观工坊'),
          h('span', { className: 'wb-sub' }, world ? `${world.name} · ${world.type || '未设类型'} · ${world.era || '未设时代'}` : '多个世界观，各自独立存放'),
          h('div', { className: 'wb-headactions' },
            h(Btn, { size: 'sm', variant: 'primary', onClick: onGenerate, disabled: Boolean(busy) }, '✦ AI 生成'),
            h(Btn, { size: 'sm', onClick: onImport, disabled: Boolean(busy) }, '⇪ 导入'),
            h(Btn, { size: 'sm', onClick: onExport, disabled: Boolean(busy) || !world }, '⇩ 导出'),
            h(Btn, { size: 'sm', onClick: onNew, disabled: Boolean(busy) }, '＋ 新建'),
            h(IconBtn, { label: '更多操作', onClick: onMenu, disabled: Boolean(busy) }, '⋯'))),
        h('div', { className: 'wb-headbar' },
          h('select', {
            className: 'wb-select',
            value: world?.id || '',
            disabled: Boolean(busy),
            'aria-label': '切换世界观',
            onChange: (event) => onSelect(event.target.value),
          },
          state.worlds.length === 0
            ? h('option', { value: '' }, '暂无世界观')
            : state.worlds.map((item) => h('option', { key: item.id, value: item.id }, `${item.name}${item.type ? ` · ${item.type}` : ''}${item.completeness < 100 ? ` · ${item.completeness}%` : ''}`))),
          h('span', { className: 'wb-save' },
            h('i', { className: 'wb-savedot', 'data-state': status }),
            saveText),
          world ? h('span', { className: 'wb-hint' }, `事件 ${counts.events} · 构成 ${counts.composition} · 设定 ${counts.settings}`) : null),
        h('nav', { className: 'wb-tabs', role: 'tablist' },
          TABS.map((item) => h('button', {
            key: item.key,
            type: 'button',
            role: 'tab',
            className: 'wb-tab',
            'data-active': tab === item.key,
            'aria-selected': tab === item.key,
            onClick: () => setTab(item.key),
          },
          h('span', { className: 'wb-tab-glyph' }, item.glyph),
          item.label,
          item.key === 'events' && counts ? h('span', { className: 'wb-tag' }, String(counts.events)) : null,
          item.key === 'composition' && counts ? h('span', { className: 'wb-tag' }, String(counts.composition)) : null,
          item.key === 'settings' && counts ? h('span', { className: 'wb-tag' }, String(counts.settings)) : null))));
    }

    /* --------------------------------------------------------------- 页面 */

    function WorldbuildingPage({ connection }) {
      const [state, setState] = useState({ worlds: [], activeId: null, dataDir: '' });
      const [world, setWorld] = useState(null);
      const [loaded, setLoaded] = useState(false);
      const [tab, setTab] = useState('overview');
      const [mapUrl, setMapUrl] = useState('');
      const [modal, setModal] = useState(null);
      const [menu, setMenu] = useState(false);
      const [busy, setBusy] = useState(null);
      const [switching, setSwitching] = useState(false);
      const [toastState, setToastState] = useState(null);
      const [saving, setSaving] = useState(false);
      const [dirty, setDirty] = useState(false);
      const [savedAt, setSavedAt] = useState(0);
      const [aiInput, setAiInput] = useState('');
      const [aiPending, setAiPending] = useState('');
      const [modalSeq, setModalSeq] = useState(0);

      const worldRef = useRef(null);
      const revRef = useRef(0);
      const dirtyRef = useRef(false);
      const savingRef = useRef(false);
      const pendingRef = useRef(false);
      const editRef = useRef(0);
      const saveTimer = useRef(null);
      const toastTimer = useRef(null);
      const saveNowRef = useRef(null);
      const scheduleSaveRef = useRef(null);
      const aiControllerRef = useRef(null);

      const toast = useCallback((text, kind = 'ok') => {
        if (!text) return;
        setToastState({ text, kind, at: Date.now() });
        if (toastTimer.current) clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToastState(null), kind === 'error' ? 6000 : 3600);
      }, []);

      useEffect(() => () => {
        if (toastTimer.current) clearTimeout(toastTimer.current);
        if (saveTimer.current) clearTimeout(saveTimer.current);
        aiControllerRef.current?.abort();
      }, []);

      const request = useCallback(async (action, payload, signal) => {
        let result;
        try {
          result = await connection.rpc.call(API_CHANNEL, action, payload || {}, signal);
        } catch (error) {
          if (error?.name === 'AbortError') {
            const aborted = new Error('已取消');
            aborted.code = 'worldbuilding/aborted';
            throw aborted;
          }
          throw new Error(`无法连接世界观工坊服务：${error?.message || error}`);
        }
        if (!result || typeof result !== 'object') throw new Error('世界观工坊没有返回结果');
        if (!result.ok) {
          const failure = new Error(result.error?.message || '操作失败');
          failure.code = result.error?.code || '';
          failure.details = result.error?.details || {};
          throw failure;
        }
        return result.value;
      }, [connection]);

      const applyWorld = useCallback((data) => {
        if (!data?.world) return;
        setWorld(data.world);
        worldRef.current = data.world;
        revRef.current = Number(data.rev ?? data.world.rev ?? 0);
        setDirty(false);
        dirtyRef.current = false;
        setSavedAt(Date.now());
        if (data.state) setState(data.state);
        if (saveTimer.current) clearTimeout(saveTimer.current);
      }, []);

      const loadMapFor = useCallback(async (target) => {
        if (!target?.map?.image) {
          setMapUrl('');
          return;
        }
        try {
          const data = await request('world/map', { id: target.id });
          setMapUrl(data.dataUrl || '');
        } catch {
          setMapUrl('');
        }
      }, [request]);

      const reloadWorld = useCallback(async (id) => {
        const data = await request('world/get', { id });
        setWorld(data.world);
        worldRef.current = data.world;
        revRef.current = Number(data.rev ?? 0);
        setDirty(false);
        dirtyRef.current = false;
        if (data.state) setState(data.state);
        await loadMapFor(data.world);
      }, [request, loadMapFor]);

      const saveNow = useCallback(async () => {
        const current = worldRef.current;
        if (!current || !dirtyRef.current) return true;
        if (savingRef.current) {
          pendingRef.current = true;
          return false;
        }
        savingRef.current = true;
        setSaving(true);
        const editAtStart = editRef.current;
        try {
          const data = await request('world/save', {
            id: current.id,
            world: current,
            rev: revRef.current,
          });
          revRef.current = Number(data.rev ?? revRef.current);
          if (data.state) setState(data.state);
          setSavedAt(Date.now());
          if (editRef.current === editAtStart) {
            dirtyRef.current = false;
            setDirty(false);
          } else {
            pendingRef.current = true;
          }
          return true;
        } catch (error) {
          if (error.code === 'worldbuilding/conflict') {
            toast('世界观刚被其他操作更新，正在重新加载', 'error');
            await reloadWorld(current.id);
            return false;
          }
          toast(error.message || '保存失败', 'error');
          return false;
        } finally {
          savingRef.current = false;
          setSaving(false);
          if (pendingRef.current && dirtyRef.current) {
            pendingRef.current = false;
            scheduleSaveRef.current?.();
          }
        }
      }, [request, reloadWorld, toast]);
      saveNowRef.current = saveNow;

      const scheduleSave = useCallback(() => {
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => { void saveNowRef.current?.(); }, 750);
      }, []);
      scheduleSaveRef.current = scheduleSave;

      const mutate = useCallback((mutator) => {
        editRef.current += 1;
        dirtyRef.current = true;
        setDirty(true);
        setWorld((previous) => {
          if (!previous) return previous;
          const draft = clone(previous);
          mutator(draft);
          worldRef.current = draft;
          return draft;
        });
        if (savingRef.current) pendingRef.current = true;
        else scheduleSaveRef.current?.();
      }, []);

      const flushSave = useCallback(async () => {
        for (let attempt = 0; attempt < 40; attempt += 1) {
          if (!dirtyRef.current) return true;
          if (savingRef.current) {
            await new Promise((resolve) => setTimeout(resolve, 120));
            continue;
          }
          await saveNowRef.current?.();
          if (!dirtyRef.current) return true;
          await new Promise((resolve) => setTimeout(resolve, 60));
        }
        return false;
      }, []);

      useEffect(() => {
        let alive = true;
        (async () => {
          try {
            const data = await request('state');
            if (!alive) return;
            setState(data);
            if (data.activeId) {
              const full = await request('world/get', { id: data.activeId });
              if (!alive) return;
              setWorld(full.world);
              worldRef.current = full.world;
              revRef.current = Number(full.rev ?? 0);
              if (full.state) setState(full.state);
              await loadMapFor(full.world);
            }
          } catch (error) {
            if (alive) toast(error.message || '无法读取世界观数据', 'error');
          } finally {
            if (alive) setLoaded(true);
          }
        })();
        return () => { alive = false; };
      }, [request, loadMapFor, toast]);

      const selectWorld = useCallback(async (id) => {
        if (!id || id === worldRef.current?.id || busy) return;
        setMenu(false);
        setSwitching(true);
        try {
          await flushSave();
          const data = await request('world/get', { id });
          const activated = await request('world/activate', { id });
          setWorld(data.world);
          worldRef.current = data.world;
          revRef.current = Number(data.rev ?? 0);
          setState(activated.state || data.state || state);
          setDirty(false);
          dirtyRef.current = false;
          setAiPending('');
          await loadMapFor(data.world);
          setTab('overview');
        } catch (error) {
          toast(error.message || '切换失败', 'error');
        } finally {
          setSwitching(false);
        }
      }, [busy, flushSave, request, state, loadMapFor, toast]);

      const createWorld = useCallback(async (name) => {
        setModal(null);
        setBusy({ label: '正在新建世界观…', start: Date.now() });
        try {
          const data = await request('world/create', { name });
          applyWorld(data);
          setMapUrl('');
          setTab('overview');
          toast(`已新建《${data.world.name}》`);
        } catch (error) {
          toast(error.message || '新建失败', 'error');
        } finally {
          setBusy(null);
        }
      }, [request, applyWorld, toast]);

      const deleteCurrent = useCallback(async () => {
        const current = worldRef.current;
        setModal(null);
        setMenu(false);
        if (!current) return;
        setBusy({ label: `正在删除《${current.name}》…`, start: Date.now() });
        try {
          const data = await request('world/delete', { id: current.id });
          setState(data.state);
          if (data.state.activeId) {
            const next = await request('world/get', { id: data.state.activeId });
            setWorld(next.world);
            worldRef.current = next.world;
            revRef.current = Number(next.rev ?? 0);
            if (next.state) setState(next.state);
            await loadMapFor(next.world);
          } else {
            setWorld(null);
            worldRef.current = null;
            revRef.current = 0;
            setMapUrl('');
          }
          toast(`已删除《${data.deleted}》`);
        } catch (error) {
          toast(error.message || '删除失败', 'error');
        } finally {
          setBusy(null);
        }
      }, [request, loadMapFor, toast]);

      const runGenerate = useCallback(async (payload) => {
        setModal(null);
        const controller = new AbortController();
        const label = payload.mode === 'new' ? '正在生成世界观…' : payload.mode === 'fill' ? '正在补全世界观…' : '正在重写世界观…';
        setBusy({ label, controller, start: Date.now() });
        try {
          await flushSave();
          const data = await request('ai/generate', { ...payload, id: worldRef.current?.id }, controller.signal);
          applyWorld(data);
          await loadMapFor(data.world);
          setTab('overview');
          toast(payload.mode === 'new' ? `已生成《${data.world.name}》` : '已更新世界观');
        } catch (error) {
          if (error.code === 'worldbuilding/aborted') toast('已取消');
          else toast(error.message || '生成失败', 'error');
        } finally {
          setBusy(null);
        }
      }, [flushSave, request, applyWorld, loadMapFor, toast]);

      const runImport = useCallback(async (payload) => {
        setModal(null);
        const controller = new AbortController();
        setBusy({ label: '正在识别并格式化导入内容…', controller, start: Date.now() });
        try {
          await flushSave();
          const data = await request('ai/import', { ...payload, id: worldRef.current?.id }, controller.signal);
          applyWorld(data);
          await loadMapFor(data.world);
          setTab('overview');
          toast(payload.mode === 'merge' ? '已合并进当前世界观' : `已导入《${data.world.name}》`);
        } catch (error) {
          if (error.code === 'worldbuilding/aborted') toast('已取消');
          else toast(error.message || '导入失败', 'error');
        } finally {
          setBusy(null);
        }
      }, [flushSave, request, applyWorld, loadMapFor, toast]);

      const uploadMap = useCallback(async (file) => {
        if (!file) return;
        if (file.size > 6 * 1024 * 1024) {
          toast('地图图片不能超过 6MB', 'error');
          return;
        }
        setBusy({ label: '正在上传地图…', start: Date.now() });
        try {
          const dataUrl = await readDataUrl(file);
          const data = await request('world/map/upload', { id: worldRef.current.id, dataUrl });
          setWorld(data.world);
          worldRef.current = data.world;
          revRef.current = Number(data.rev ?? revRef.current);
          setMapUrl(data.dataUrl || '');
          toast('地图已更新');
        } catch (error) {
          toast(error.message || '上传失败', 'error');
        } finally {
          setBusy(null);
        }
      }, [request, toast]);

      const removeMap = useCallback(async () => {
        setBusy({ label: '正在移除地图…', start: Date.now() });
        try {
          const data = await request('world/map/remove', { id: worldRef.current.id });
          setWorld(data.world);
          worldRef.current = data.world;
          revRef.current = Number(data.rev ?? revRef.current);
          setMapUrl('');
          toast('地图已移除');
        } catch (error) {
          toast(error.message || '移除失败', 'error');
        } finally {
          setBusy(null);
        }
      }, [request, toast]);

      const sendAi = useCallback(async () => {
        const text = aiInput.trim();
        if (!text || aiPending || !worldRef.current || busy) return;
        const controller = new AbortController();
        aiControllerRef.current = controller;
        setAiInput('');
        setAiPending(text);
        try {
          await flushSave();
          const data = await request('ai/chat', { id: worldRef.current.id, message: text }, controller.signal);
          applyWorld(data);
          toast(data.applied?.length ? `已应用 ${data.applied.length} 项修改` : '已回复');
        } catch (error) {
          if (error.code === 'worldbuilding/aborted') toast('已取消');
          else {
            toast(error.message || '发送失败', 'error');
            setAiInput(text);
          }
        } finally {
          setAiPending('');
          aiControllerRef.current = null;
        }
      }, [aiInput, aiPending, busy, flushSave, request, applyWorld, toast]);

      const openModal = useCallback((next) => {
        setModalSeq((value) => value + 1);
        setMenu(false);
        setModal({ ...next, token: `${Date.now()}-${modalSeq}` });
      }, [modalSeq]);

      const openEntry = useCallback((target, entry = null, extra = {}) => {
        openModal({ kind: 'entry', target, entry, ...extra });
      }, [openModal]);

      const saveEntry = useCallback((target, values, existing) => {
        mutate((draft) => {
          const list = target === 'marker' ? draft.map.markers
            : target === 'event' ? draft.events
              : target === 'timeline' ? draft.timeline
                : target === 'composition' ? draft.composition
                  : draft.settings;
          if (existing?.id) {
            const item = list.find((entry) => entry.id === existing.id);
            if (item) Object.assign(item, values, { updatedAt: Date.now() });
          } else {
            const prefix = target === 'event' ? 'ev' : target === 'timeline' ? 'tl' : target === 'composition' ? 'cp' : target === 'setting' ? 'se' : 'mk';
            list.push({ id: localId(prefix), ...values, createdAt: Date.now(), updatedAt: Date.now() });
          }
          if (target === 'event') draft.events = sortEventsClient(draft.events);
          if (target === 'marker') draft.map.markers = draft.map.markers.slice(0, 240);
        });
        setModal(null);
      }, [mutate]);

      const removeEntry = useCallback((target, entry) => {
        const label = target === 'event' ? '事件' : target === 'timeline' ? '时代' : target === 'composition' ? '构成' : target === 'setting' ? '设定' : '地图标注';
        openModal({
          kind: 'confirm',
          title: `删除这个${label}？`,
          description: `「${entry.title || entry.name || '未命名'}」会从当前世界观中移除。保存后无法撤销。`,
          confirmText: '删除',
          danger: true,
          onConfirm: () => {
            mutate((draft) => {
              const list = target === 'marker' ? draft.map.markers
                : target === 'event' ? draft.events
                  : target === 'timeline' ? draft.timeline
                    : target === 'composition' ? draft.composition
                      : draft.settings;
              const index = list.findIndex((item) => item.id === entry.id);
              if (index >= 0) list.splice(index, 1);
              if (target === 'event') draft.events = sortEventsClient(draft.events);
            });
            setModal(null);
          },
        });
      }, [mutate, openModal]);

      const moveTimeline = useCallback((id, delta) => {
        mutate((draft) => {
          const index = draft.timeline.findIndex((item) => item.id === id);
          const target = index + delta;
          if (index < 0 || target < 0 || target >= draft.timeline.length) return;
          const [item] = draft.timeline.splice(index, 1);
          draft.timeline.splice(target, 0, item);
        });
      }, [mutate]);

      const clearChat = useCallback(() => {
        openModal({
          kind: 'confirm',
          title: '清空 AI 对话记录？',
          description: '只清空当前世界观里的助手对话，不会删除已经写入的时间线、构成与设定。',
          confirmText: '清空',
          danger: true,
          onConfirm: () => {
            mutate((draft) => { draft.aiChat = []; });
            setModal(null);
          },
        });
      }, [mutate, openModal]);

      const rename = useCallback((name) => {
        const next = String(name || '').trim();
        if (!next) {
          toast('名称不能为空', 'error');
          return;
        }
        mutate((draft) => { draft.name = next.slice(0, 120); });
        setModal(null);
      }, [mutate, toast]);

      const refresh = useCallback(async () => {
        setMenu(false);
        try {
          await flushSave();
          const data = await request('state');
          setState(data);
          if (data.activeId) {
            const full = await request('world/get', { id: data.activeId });
            setWorld(full.world);
            worldRef.current = full.world;
            revRef.current = Number(full.rev ?? 0);
            setDirty(false);
            dirtyRef.current = false;
            await loadMapFor(full.world);
          }
          toast('已刷新');
        } catch (error) {
          toast(error.message || '刷新失败', 'error');
        }
      }, [flushSave, request, loadMapFor, toast]);

      const openGenerate = useCallback((mode = 'new') => {
        openModal({
          kind: 'generate',
          initialMode: mode,
          initialPrompt: mode === 'fill' ? '补全缺失或过薄的部分，保持已有设定与专有名词不变。' : '',
        });
      }, [openModal]);

      const cancelBusy = useCallback(() => {
        busy?.controller?.abort();
      }, [busy]);

      const panelProps = { world, mutate, openEntry, removeEntry, moveTimeline, openGenerate, onExport: () => openModal({ kind: 'export' }), onGo: setTab };

      const renderPanel = () => {
        if (!world) return null;
        if (tab === 'overview') return h(OverviewPanel, { ...panelProps, savedAt });
        if (tab === 'type') return h(TypePanel, panelProps);
        if (tab === 'timeline') return h(TimelinePanel, panelProps);
        if (tab === 'events') return h(EventsPanel, panelProps);
        if (tab === 'composition') return h(CompositionPanel, panelProps);
        if (tab === 'map') return h(MapPanel, { ...panelProps, mapUrl, uploadMap, removeMap });
        if (tab === 'settings') return h(SettingsPanel, panelProps);
        if (tab === 'ai') return h(AiPanel, { world, aiInput, setAiInput, onSend: sendAi, pending: aiPending, onCancel: () => aiControllerRef.current?.abort(), onGenerate: () => openGenerate('fill'), onClearChat: clearChat });
        return h(OverviewPanel, { ...panelProps, savedAt });
      };

      const renderModal = () => {
        if (!modal) return null;
        if (modal.kind === 'create') {
          return h(CreateDialog, { key: modal.token, onClose: () => setModal(null), onCreate: createWorld, onGenerate: () => { setModal(null); openGenerate('new'); } });
        }
        if (modal.kind === 'generate') {
          return h(GenerateDialog, { key: modal.token, world, initialMode: modal.initialMode, initialPrompt: modal.initialPrompt, onClose: () => setModal(null), onSubmit: runGenerate });
        }
        if (modal.kind === 'import') {
          return h(ImportDialog, { key: modal.token, world, onClose: () => setModal(null), onSubmit: runImport });
        }
        if (modal.kind === 'export') {
          return h(ExportDialog, { key: modal.token, world, request, onClose: () => setModal(null), toast });
        }
        if (modal.kind === 'entry') {
          return h(EntryDialog, { key: modal.token, target: modal.target, entry: modal.entry, coords: modal.coords, onClose: () => setModal(null), onSave: saveEntry });
        }
        if (modal.kind === 'confirm') {
          return h(ConfirmDialog, { key: modal.token, modal, onClose: () => setModal(null) });
        }
        if (modal.kind === 'rename') {
          return h(RenameDialog, { key: modal.token, world, onClose: () => setModal(null), onRename: rename });
        }
        return null;
      };

      if (!loaded) {
        return h('div', { className: 'wb-root' }, h('style', { dangerouslySetInnerHTML: { __html: CSS } }), h(Loading));
      }

      return h('div', { className: 'wb-root' },
        h('style', { dangerouslySetInnerHTML: { __html: CSS } }),
        h(Header, {
          state,
          world,
          tab,
          setTab,
          busy: busy || switching,
          onSelect: selectWorld,
          onNew: () => openModal({ kind: 'create' }),
          onGenerate: () => openGenerate('new'),
          onImport: () => openModal({ kind: 'import' }),
          onExport: () => openModal({ kind: 'export' }),
          onMenu: () => setMenu((value) => !value),
          saving,
          dirty,
          savedAt,
        }),
        h('div', { className: 'wb-body' },
          world
            ? renderPanel()
            : h(EmptyState, {
              onCreate: () => openModal({ kind: 'create' }),
              onGenerate: () => openGenerate('new'),
              onImport: () => openModal({ kind: 'import' }),
              loading: switching,
            })),
        menu ? h('div', { className: 'wb-menu-mask', onMouseDown: () => setMenu(false) }) : null,
        menu ? h('div', { className: 'wb-menu', role: 'menu' },
          h('button', { type: 'button', className: 'wb-menu-item', onClick: () => openModal({ kind: 'rename' }) }, '重命名当前世界观'),
          h('button', { type: 'button', className: 'wb-menu-item', onClick: refresh }, '刷新数据'),
          h('button', { type: 'button', className: 'wb-menu-item', onClick: () => { setMenu(false); toast(state.dataDir ? `数据目录：${state.dataDir}` : '数据存放在 DSH_HOME/worldbuilding'); } }, '查看数据目录'),
          h('div', { className: 'wb-menu-sep' }),
          h('button', { type: 'button', className: 'wb-menu-item wb-menu-item--danger', onClick: () => openModal({ kind: 'confirm', title: `删除《${world?.name || ''}》？`, description: '会永久删除这个世界观的 JSON 文件、地图图片与全部内容，其他世界观不受影响。', confirmText: '删除', danger: true, onConfirm: deleteCurrent }) }, '删除当前世界观'))
          : null,
        h(Toast, { toast: toastState }),
        busy ? h(BusyOverlay, { busy, onCancel: cancelBusy }) : null,
        renderModal());
    }

    /* --------------------------------------------------------------- 空态 */

    function EmptyState({ onCreate, onGenerate, onImport }) {
      return h('div', { className: 'wb-scroll' },
        h('div', { className: 'wb-narrow' },
          h('div', { className: 'wb-hero', style: { flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '44px 20px' } },
            h('div', { style: { fontSize: 40, opacity: 0.5 } }, '◈'),
            h('h2', { style: { margin: '4px 0 0', fontSize: 20, fontWeight: 600 } }, '还没有世界观'),
            h('p', { style: { margin: 0, maxWidth: 520, color: 'var(--wb-dim)', fontSize: 13, lineHeight: 1.8 } },
              '每个世界观都有独立的世界类型、时代与时间线、重大事件、主要构成、世界地图和基本设定。可以从一句话开始让 AI 生成，也可以导入现成的设定资料。'),
            h('div', { className: 'wb-inline', style: { justifyContent: 'center' } },
              h(Btn, { variant: 'primary', onClick: onGenerate }, '✦ 让 AI 生成'),
              h(Btn, { onClick: onCreate }, '＋ 新建空世界观'),
              h(Btn, { onClick: onImport }, '⇪ 导入资料')),
            h('div', { className: 'wb-hint', style: { maxWidth: 540, marginTop: 4 } },
              '生成后可以逐项修改；也可以在主对话里让 AI 用 worldbuilding_* 工具直接补充当前世界观。'))));
    }

    /* --------------------------------------------------------------- 概览 */

    function TagsEditor({ value, onChange }) {
      const [text, setText] = useState(value.join('，'));
      const joined = value.join('，');
      useEffect(() => {
        setText((previous) => (splitTags(previous).join('，') === joined ? previous : joined));
      }, [joined]);
      const commit = () => onChange(splitTags(text));
      return h('input', {
        className: 'wb-input',
        value: text,
        placeholder: '海洋，宫廷，低魔',
        onChange: (event) => setText(event.target.value),
        onBlur: commit,
        onKeyDown: (event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit();
            event.currentTarget.blur();
          }
        },
      });
    }

    function OverviewPanel({ world, mutate, openGenerate, onExport, onGo, savedAt }) {
      const counts = countsOfClient(world);
      const completeness = completenessOfClient(world);
      const checks = [
        { label: '世界名与总览', done: Boolean(world.name && world.name !== '未命名世界观' && world.summary), tab: 'overview' },
        { label: '世界类型与风格', done: Boolean(world.type), tab: 'type' },
        { label: '当前时代与时间线', done: Boolean(world.era && world.timeline.length), tab: 'timeline' },
        { label: '重大事件', done: world.events.length > 0, tab: 'events' },
        { label: '主要构成', done: world.composition.length > 0, tab: 'composition' },
        { label: '世界地图', done: Boolean(world.map.notes || world.map.image || world.map.markers.length), tab: 'map' },
        { label: '基本设定与规则', done: world.settings.length > 0, tab: 'settings' },
      ];
      return h('div', { className: 'wb-scroll' },
        h('div', { className: 'wb-narrow' },
          h('section', { className: 'wb-hero' },
            h('div', { className: 'wb-hero-main' },
              h('div', { className: 'wb-eyebrow' }, 'Worldbuilding'),
              h('input', {
                className: 'wb-hero-name',
                value: world.name,
                'aria-label': '世界观名称',
                onChange: (event) => mutate((draft) => { draft.name = event.target.value; }),
              }),
              h('div', { className: 'wb-hero-meta' },
                `${world.type || '未设置类型'} · ${world.era || '未设置时代'} · 更新于 ${formatTime(world.updatedAt) || '刚刚'}`)),
            h('div', { className: 'wb-hero-side' },
              h('div', { className: 'wb-progress-label' }, h('span', null, '完整度'), h('b', null, `${completeness}%`)),
              h(Progress, { value: completeness }),
              h('div', { className: 'wb-inline' },
                h(Btn, { size: 'sm', variant: 'primary', onClick: () => openGenerate('fill') }, '✦ AI 补全'),
                h(Btn, { size: 'sm', onClick: onExport }, '⇩ 导出')),
              h('span', { className: 'wb-hint' }, savedAt ? `上次保存 ${formatTime(savedAt)}` : '编辑会自动保存'))),
          h('div', { className: 'wb-stats' },
            h('button', { type: 'button', className: 'wb-stat', onClick: () => onGo('events') }, h('b', null, String(counts.events)), h('span', null, '重大事件')),
            h('button', { type: 'button', className: 'wb-stat', onClick: () => onGo('timeline') }, h('b', null, String(counts.timeline)), h('span', null, '时代划分')),
            h('button', { type: 'button', className: 'wb-stat', onClick: () => onGo('composition') }, h('b', null, String(counts.composition)), h('span', null, '主要构成')),
            h('button', { type: 'button', className: 'wb-stat', onClick: () => onGo('settings') }, h('b', null, String(counts.settings)), h('span', null, '基本设定')),
            h('button', { type: 'button', className: 'wb-stat', onClick: () => onGo('map') }, h('b', null, String(counts.markers)), h('span', null, '地图标注'))),
          h(SectionCard, {
            title: '总览',
            desc: '这个世界是什么、最核心的矛盾、普通人怎么活、故事可以从哪里开始。',
          },
          h('textarea', {
            className: 'wb-area',
            style: { minHeight: 180 },
            value: world.summary,
            placeholder: '写几句总览，或点「AI 补全」让模型先起稿…',
            onChange: (event) => mutate((draft) => { draft.summary = event.target.value; }),
          })),
          h(SectionCard, {
            title: '标签',
            desc: '用逗号分隔，例如：海洋，宫廷，低魔。',
          },
          h(TagsEditor, {
            value: world.tags,
            onChange: (tags) => mutate((draft) => { draft.tags = tags; }),
          })),
          h('div', { className: 'wb-grid2' },
            h(SectionCard, { title: '完成度检查' },
              checks.map((check) => h('div', { key: check.label, className: 'wb-check', 'data-done': check.done ? 'true' : 'false' },
                h('span', { className: 'wb-check-dot' }, '✓'),
                h('b', null, check.label),
                h(Btn, { size: 'sm', variant: 'ghost', onClick: () => onGo(check.tab) }, check.done ? '查看' : '去补')))),
            h(SectionCard, { title: '从这里开始' },
              h('div', { className: 'wb-quick' },
                h(Btn, { size: 'sm', onClick: () => openGenerate('fill') }, '✦ 一键补全缺失内容'),
                h(Btn, { size: 'sm', onClick: () => onGo('events') }, '⚑ 添加第一条重大事件'),
                h(Btn, { size: 'sm', onClick: () => onGo('composition') }, '❖ 补充势力与地理'),
                h(Btn, { size: 'sm', onClick: () => onGo('settings') }, '⚖ 写一条世界规则'),
                h(Btn, { size: 'sm', onClick: () => onGo('ai') }, '✧ 用对话继续补充'))))));
    }

    /* ------------------------------------------------------------ 世界类型 */

    function TypePanel({ world, mutate }) {
      return h('div', { className: 'wb-scroll' },
        h('div', { className: 'wb-narrow' },
          h(SectionCard, {
            title: '世界类型',
            desc: '世界类型决定整体风格：力量从哪里来、社会怎么运转、故事能写什么。可以选一个预设，也可以自己写。',
          },
          h('div', { className: 'wb-chips' },
            TYPE_PRESETS.map((preset) => h(Chip, {
              key: preset,
              active: world.type === preset,
              onClick: () => mutate((draft) => { draft.type = preset; }),
            }, preset))),
          h(Field, { label: '类型名称', hint: '一句话即可；AI 生成与对话补充都会带上下文。' },
            h('input', {
              className: 'wb-input',
              value: world.type,
              placeholder: '例如：高魔奇幻、低魔悬疑、月球背面的科幻',
              onChange: (event) => mutate((draft) => { draft.type = event.target.value; }),
            }))),
          h(SectionCard, {
            title: '风格',
            desc: '叙事基调、审美、语言质感、可以引用哪些意象，以及要避免什么。AI 生成时会把它当作硬约束。',
          },
          h('textarea', {
            className: 'wb-area',
            style: { minHeight: 240 },
            value: world.style,
            placeholder: '例如：冷峻、潮湿、克制的第三人称；多用触觉与气味；避免现代网络用语与龙傲天式爽点。',
            onChange: (event) => mutate((draft) => { draft.style = event.target.value; }),
          })),
          h(SectionCard, {
            title: '世界名',
            desc: '会出现在导出文件名、列表与系统提示词里。',
          },
          h('input', {
            className: 'wb-input',
            value: world.name,
            onChange: (event) => mutate((draft) => { draft.name = event.target.value; }),
          }))));
    }

    /* ------------------------------------------------------------- 时间线 */

    function TimelinePanel({ world, mutate, openEntry, removeEntry, moveTimeline }) {
      return h('div', { className: 'wb-scroll' },
        h('div', { className: 'wb-narrow' },
          h(SectionCard, {
            title: '当前时代',
            desc: '时间线决定时代。先写清「现在是什么时代、技术或力量到了哪一步、社会是什么状态」，再划分历史时代。',
          },
          h('div', { className: 'wb-formrow' },
            h(Field, { label: '时代名称' },
              h('input', {
                className: 'wb-input',
                value: world.era,
                placeholder: '例如：第三纪元 · 灰烬历 1200 年',
                onChange: (event) => mutate((draft) => { draft.era = event.target.value; }),
              }))),
          h(Field, { label: '时代说明', hint: '现在正在发生什么？普通人感受到的变化是什么？' },
            h('textarea', {
              className: 'wb-area',
              value: world.eraNote,
              placeholder: '旧帝国崩塌后的第三十年，诸侯割据，灯塔议会名存实亡……',
              onChange: (event) => mutate((draft) => { draft.eraNote = event.target.value; }),
            }))),
          h('div', { className: 'wb-sectionhead' },
            h('h3', null, '时代划分'),
            h('span', { className: 'wb-hint' }, '按时间先后排列，可上下调整'),
            h('span', { className: 'wb-spacer' }),
            h(Btn, { size: 'sm', onClick: () => openEntry('timeline') }, '＋ 添加时代')),
          world.timeline.length === 0
            ? h(EmptyBlock, {
              glyph: '⟳',
              title: '还没有时代划分',
              text: '至少写两个时代，世界才会有「历史感」。AI 补全也会参考这里的时代名。',
              action: h(Btn, { size: 'sm', onClick: () => openEntry('timeline') }, '添加第一个时代'),
            })
            : world.timeline.map((item, index) => h('div', { key: item.id, className: 'wb-row' },
              h('div', { className: 'wb-row-main' },
                h('div', { className: 'wb-row-title' }, item.name, item.span ? h('span', null, item.span) : null),
                item.description ? h('div', { className: 'wb-row-desc' }, item.description) : null),
              h('div', { className: 'wb-row-actions' },
                h(IconBtn, { label: '上移', disabled: index === 0, onClick: () => moveTimeline(item.id, -1) }, '↑'),
                h(IconBtn, { label: '下移', disabled: index === world.timeline.length - 1, onClick: () => moveTimeline(item.id, 1) }, '↓'),
                h(IconBtn, { label: '编辑', onClick: () => openEntry('timeline', item) }, '✎'),
                h(IconBtn, { label: '删除', onClick: () => removeEntry('timeline', item) }, '×'))))));
    }

    /* ------------------------------------------------------------ 重大事件 */

    function EventsPanel({ world, openEntry, removeEntry }) {
      return h('div', { className: 'wb-scroll' },
        h('div', { className: 'wb-wide' },
          h('div', { className: 'wb-sectionhead' },
            h('h3', null, '重大事件'),
            h('span', { className: 'wb-hint' }, '按事件时间里的年份自动升序；时间写法最好带年份，例如「第三纪元 1200 年」'),
            h('span', { className: 'wb-spacer' }),
            h(Btn, { size: 'sm', variant: 'primary', onClick: () => openEntry('event') }, '＋ 添加事件')),
          world.events.length === 0
            ? h(EmptyBlock, {
              glyph: '⚑',
              title: '还没有重大事件',
              text: '事件是世界观的骨架。添加 3 条以上，并写清「发生了什么」和「造成了什么长期影响」。',
              action: h(Btn, { size: 'sm', onClick: () => openEntry('event') }, '添加第一条事件'),
            })
            : world.events.map((event) => h('article', { key: event.id, className: 'wb-event' },
              h('div', { className: 'wb-event-time' }, event.time || '时间未定'),
              h('div', null,
                h('div', { className: 'wb-event-title' }, event.title),
                event.description ? h('div', { className: 'wb-event-desc' }, event.description) : null,
                event.impact ? h('div', { className: 'wb-impact' }, h('b', null, '影响 '), event.impact) : null),
              h('div', { className: 'wb-actions' },
                h(IconBtn, { label: '编辑事件', onClick: () => openEntry('event', event) }, '✎'),
                h(IconBtn, { label: '删除事件', onClick: () => removeEntry('event', event) }, '×'))))));
    }

    /* ------------------------------------------------------------ 条目列表 */

    function EntryListPanel({ kind, title, desc, hint, presets, world, openEntry, removeEntry }) {
      const items = kind === 'composition' ? world.composition : world.settings;
      const label = kind === 'composition' ? '构成项' : '设定项';
      return h('div', { className: 'wb-scroll' },
        h('div', { className: 'wb-narrow' },
          h(SectionCard, { title, desc },
            presets?.length ? h('div', { className: 'wb-chips' },
              presets.map((preset) => h(Chip, {
                key: preset,
                onClick: () => openEntry(kind, null, { presetTitle: preset }),
              }, preset))) : null,
            h('div', { className: 'wb-inline', style: { marginTop: 8 } },
              h('span', { className: 'wb-hint' }, hint || `${items.length} 个${label}`),
              h('span', { className: 'wb-spacer' }),
              h(Btn, { size: 'sm', onClick: () => openEntry(kind) }, `＋ 添加${label}`))),
          items.length === 0
            ? h(EmptyBlock, {
              glyph: kind === 'composition' ? '❖' : '⚖',
              title: `还没有${label}`,
              text: kind === 'composition'
                ? '从地理、势力、族群、经济、军事、宗教、技术体系里挑几项写，世界会立刻立体起来。'
                : '规则要有边界和代价。至少写一条世界规则和一条力量/技术体系的上限。',
              action: h(Btn, { size: 'sm', onClick: () => openEntry(kind) }, `添加第一个${label}`),
            })
            : items.map((item) => h('div', { key: item.id, className: 'wb-row' },
              h('div', { className: 'wb-row-main' },
                h('div', { className: 'wb-row-title' }, item.title),
                item.content ? h('div', { className: 'wb-row-desc' }, item.content) : h('div', { className: 'wb-hint' }, '（待补充）')),
              h('div', { className: 'wb-row-actions' },
                h(IconBtn, { label: '编辑', onClick: () => openEntry(kind, item) }, '✎'),
                h(IconBtn, { label: '删除', onClick: () => removeEntry(kind, item) }, '×'))))));
    }

    function CompositionPanel(props) {
      return h(EntryListPanel, {
        ...props,
        kind: 'composition',
        title: '主要构成',
        desc: '杂项都放这里：地理、势力、族群、经济、军事、宗教、技术或力量体系、普通人的日常。',
        presets: COMPOSITION_PRESETS,
      });
    }

    function SettingsPanel(props) {
      return h(EntryListPanel, {
        ...props,
        kind: 'setting',
        title: '基本设定',
        desc: '世界的底层规则：力量从哪里来、有什么边界和代价、什么绝对不能做。',
        presets: SETTING_PRESETS,
      });
    }

    /* ------------------------------------------------------------- 地图 */

    function MapPanel({ world, mutate, mapUrl, uploadMap, removeMap, openEntry, removeEntry }) {
      const fileRef = useRef(null);
      const [drag, setDrag] = useState(false);
      const onPick = () => fileRef.current?.click();
      const onFile = (event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (file) void uploadMap(file);
      };
      const onDrop = (event) => {
        event.preventDefault();
        setDrag(false);
        const file = event.dataTransfer?.files?.[0];
        if (file) void uploadMap(file);
      };
      const onImageClick = (event) => {
        if (event.target.closest('.wb-marker')) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
        const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
        openEntry('marker', null, { coords: { x, y } });
      };
      return h('div', { className: 'wb-scroll' },
        h('div', { className: 'wb-wide' },
          h(SectionCard, {
            title: '世界地图',
            desc: '上传一张图（PNG / JPEG / WebP / GIF，最大 6MB），点击地图任意位置添加标注；也可以只写地理说明。',
            actions: h('div', { className: 'wb-inline' },
              h(Btn, { size: 'sm', onClick: onPick }, mapUrl ? '更换地图' : '上传地图'),
              mapUrl ? h(Btn, { size: 'sm', variant: 'danger', onClick: removeMap }, '移除') : null),
          },
          h('input', { ref: fileRef, type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', style: { display: 'none' }, onChange: onFile }),
          h('div', {
            className: 'wb-mapframe',
            onDragOver: (event) => { event.preventDefault(); setDrag(true); },
            onDragLeave: () => setDrag(false),
            onDrop,
            style: drag ? { borderColor: 'var(--wb-accent)' } : undefined,
          },
          mapUrl
            ? h('div', { style: { position: 'relative', width: '100%' } },
              h('img', { className: 'wb-mapimg', src: mapUrl, alt: `${world.name} 的世界地图`, onClick: onImageClick, draggable: false }),
              world.map.markers.map((marker) => h('button', {
                key: marker.id,
                type: 'button',
                className: 'wb-marker',
                style: { left: `${marker.x * 100}%`, top: `${marker.y * 100}%` },
                title: marker.note || marker.name,
                onClick: (event) => { event.stopPropagation(); openEntry('marker', marker); },
              },
              h('i'),
              h('span', null, marker.name))))
            : h('button', { type: 'button', className: 'wb-mapempty', onClick: onPick },
              h('div', { style: { fontSize: 30, opacity: 0.5 } }, '⌖'),
              h('b', null, '点击上传世界地图'),
              h('span', { className: 'wb-hint' }, '也可以把图片拖到这里，或先在下方写地理说明；之后可以再上传图片。')))),
          h(SectionCard, { title: '地理说明', desc: '大陆与海洋的格局、气候、边境、关键地点与交通线。' },
            h('textarea', {
              className: 'wb-area',
              style: { minHeight: 140 },
              value: world.map.notes,
              placeholder: '例如：三座环礁围成内海，王都在最大环礁的珊瑚脊上；灰潮每月从东南来，只有点灯的城市能保住港口……',
              onChange: (event) => mutate((draft) => { draft.map.notes = event.target.value; }),
            })),
          h('div', { className: 'wb-sectionhead' },
            h('h3', null, '地图标注'),
            h('span', { className: 'wb-hint' }, mapUrl ? '点击地图添加；点标注可编辑' : '上传地图后点击地图添加'),
            h('span', { className: 'wb-spacer' }),
            h(Btn, { size: 'sm', disabled: !mapUrl, onClick: () => openEntry('marker', null, { coords: { x: 0.5, y: 0.5 } }) }, '＋ 经纬度添加')),
          world.map.markers.length === 0
            ? h('div', { className: 'wb-hint' }, '还没有标注。标注可以标王都、战场、秘境、商路节点等。')
            : h('div', { className: 'wb-markerlist' },
              world.map.markers.map((marker) => h('div', { key: marker.id, className: 'wb-markerrow' },
                h('span', { className: 'wb-tag' }, `${Math.round(marker.x * 100)}% , ${Math.round(marker.y * 100)}%`),
                h('b', { className: 'wb-overflow', style: { flex: 1 } }, marker.name),
                marker.note ? h('span', { className: 'wb-hint wb-overflow', style: { flex: 2 } }, marker.note) : null,
                h(IconBtn, { label: '编辑标注', onClick: () => openEntry('marker', marker) }, '✎'),
                h(IconBtn, { label: '删除标注', onClick: () => removeEntry('marker', marker) }, '×'))))));
    }

    /* ------------------------------------------------------------ AI 助手 */

    function AiPanel({ world, aiInput, setAiInput, onSend, pending, onCancel, onGenerate, onClearChat }) {
      const scrollRef = useRef(null);
      const textRef = useRef(null);
      useEffect(() => {
        const node = scrollRef.current;
        if (node) node.scrollTop = node.scrollHeight;
      }, [world.aiChat.length, pending]);

      const onKeyDown = (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          if (!pending) onSend();
        }
      };
      const quick = (text) => {
        setAiInput(text);
        textRef.current?.focus();
      };
      return h('div', { className: 'wb-ai' },
        h('div', { className: 'wb-ai-head' },
          h('b', null, `AI 助手 · ${world.name}`),
          h('span', { className: 'wb-hint' }, '对话会直接写入当前世界观；每个世界的对话独立保存'),
          h('span', { className: 'wb-spacer' }),
          h(Btn, { size: 'sm', variant: 'ghost', disabled: Boolean(pending), onClick: onGenerate }, '✦ 补全缺失'),
          h(Btn, { size: 'sm', variant: 'ghost', disabled: Boolean(pending) || world.aiChat.length === 0, onClick: onClearChat }, '清空对话')),
        h('div', { className: 'wb-ai-scroll', ref: scrollRef },
          h('div', { className: 'wb-ai-inner' },
            world.aiChat.length === 0 && !pending
              ? h(EmptyBlock, {
                glyph: '✧',
                title: '用一句话继续补充',
                text: '例如「加一个与灯塔议会敌对的走私者联盟」「把灰潮的成因写进基本设定」「补三条 1200 年之后的事件」。AI 会先读当前世界观，再增量写入，不会覆盖已有内容。',
                action: h('div', { className: 'wb-chips' },
                  AI_PROMPTS.map((prompt) => h(Chip, { key: prompt, onClick: () => quick(prompt) }, prompt))),
              })
              : null,
            world.aiChat.map((message) => h('div', { key: message.id, className: `wb-msg wb-msg--${message.role === 'user' ? 'user' : 'assistant'}` },
              h('div', { className: 'wb-msg-meta' }, `${message.role === 'assistant' ? 'AI' : '我'} · ${formatTime(message.at)}`),
              message.role === 'user'
                ? h('div', { className: 'wb-bubble' }, message.text)
                : h('div', { className: 'wb-reply' },
                  message.text,
                  message.changes?.length
                    ? h('div', { className: 'wb-changes' }, message.changes.map((change, index) => h('span', { key: `${message.id}-${index}`, className: 'wb-change' }, change)))
                    : null))),
            pending
              ? h('div', null,
                h('div', { className: 'wb-msg wb-msg--user' }, h('div', { className: 'wb-bubble' }, pending)),
                h('div', { className: 'wb-msg wb-msg--assistant' },
                  h('div', { className: 'wb-reply' },
                    h('span', { className: 'wb-typing' }, h('i', { className: 'wb-dot' }), h('i', { className: 'wb-dot' }), h('i', { className: 'wb-dot' })),
                    h('div', { className: 'wb-hint', style: { marginTop: 6 } }, '正在读取当前世界观并整理要写入的内容…'))))
              : null,
            h('div', { className: 'wb-chips', style: { marginTop: 4 } },
              AI_PROMPTS.slice(0, 3).map((prompt) => h(Chip, { key: prompt, onClick: () => quick(prompt) }, prompt))))),
        h('div', { className: 'wb-composer' },
          h('div', { className: 'wb-composer-inner' },
            h('div', { className: 'wb-composer-row' },
              h('textarea', {
                ref: textRef,
                value: aiInput,
                rows: 2,
                placeholder: '告诉 AI 要往世界观里补什么…（Enter 发送，Shift+Enter 换行）',
                disabled: Boolean(pending),
                onChange: (event) => setAiInput(event.target.value),
                onKeyDown,
              }),
              pending
                ? h(Btn, { className: 'wb-cancel', onClick: onCancel }, '取消')
                : h(Btn, { className: 'wb-send', variant: 'primary', disabled: !aiInput.trim(), onClick: onSend }, '发送')),
            h('div', { className: 'wb-composer-tip' },
              h('span', null, 'AI 会增量修改：新增条目、更新指定 id、回答设定问题。'),
              h('span', null, '大改建议用「AI 生成 → 重写」，并在提示里写清楚范围。')))));
    }

    /* ------------------------------------------------------------- 对话框 */

    function CreateDialog({ onClose, onCreate, onGenerate }) {
      const [name, setName] = useState('');
      const submit = () => onCreate(name.trim() || '未命名世界观');
      return h(Modal, {
        title: '新建世界观',
        description: '先起一个名字；建好后可以逐项填写，也可以让 AI 从一句话生成。',
        onClose,
        footer: h(React.Fragment, null,
          h(Btn, { onClick: onGenerate }, '✦ 让 AI 生成'),
          h('span', { className: 'wb-spacer' }),
          h(Btn, { onClick: onClose }, '取消'),
          h(Btn, { variant: 'primary', onClick: submit }, '创建空世界观')),
      },
      h('div', { className: 'wb-form' },
        h(Field, { label: '世界观名称' },
          h('input', {
            className: 'wb-input',
            autoFocus: true,
            value: name,
            placeholder: '例如：灰烬群岛',
            onChange: (event) => setName(event.target.value),
            onKeyDown: (event) => { if (event.key === 'Enter') submit(); },
          })),
        h('p', { className: 'wb-hint' }, '空世界观会创建独立的 JSON 文件；从一句话生成则会自动填入类型、时间线、事件、构成、设定和地图说明。')));
    }

    function GenerateDialog({ world, initialMode, initialPrompt, onClose, onSubmit }) {
      const [mode, setMode] = useState(initialMode || 'new');
      const [prompt, setPrompt] = useState(initialPrompt || '');
      const [typeHint, setTypeHint] = useState(world?.type || '');
      const [styleHint, setStyleHint] = useState('');
      const [scale, setScale] = useState('standard');
      const submit = () => {
        if (mode === 'new' && !prompt.trim()) return;
        onSubmit({ mode, prompt: prompt.trim(), typeHint: typeHint.trim(), styleHint: styleHint.trim(), scale });
      };
      return h(Modal, {
        title: 'AI 生成世界观',
        description: '可以只给一句想法。模型会补齐世界类型、时代、时间线、重大事件、主要构成、基本设定和地图说明。',
        onClose,
        wide: true,
        footer: h(React.Fragment, null,
          h(Btn, { onClick: onClose }, '取消'),
          h(Btn, { variant: 'primary', disabled: mode === 'new' && !prompt.trim(), onClick: submit }, '开始生成')),
      },
      h('div', { className: 'wb-form' },
        world
          ? h('div', { className: 'wb-radios' },
            h(Radio, { active: mode === 'new', onSelect: () => setMode('new'), title: '新建另一个世界观', description: '保留当前世界，生成一份新的独立数据。' }),
            h(Radio, { active: mode === 'fill', onSelect: () => setMode('fill'), title: '补全当前世界观', description: '只填空缺与过薄的部分，不改写已有内容。' }),
            h(Radio, { active: mode === 'overwrite', onSelect: () => setMode('overwrite'), title: '重写当前世界观', description: '按新要求重写内容字段，保留名称、id 与地图图片。' }))
          : null,
        h(Field, {
          label: mode === 'new' ? '核心想法（必填）' : '这次的要求（可留空）',
          hint: mode === 'new' ? '一句话就够。例如：一个建立在珊瑚上的潮汐王国，国王靠与海灵立约维持统治。' : '留空则按「补全缺失内容」处理。',
        },
        h('textarea', {
          className: 'wb-area',
          style: { minHeight: 110 },
          value: prompt,
          placeholder: '一句话、几个关键词、一段设定草稿都可以…',
          onChange: (event) => setPrompt(event.target.value),
        })),
        h('div', { className: 'wb-formrow' },
          h(Field, { label: '类型偏好' },
            h('input', {
              className: 'wb-input',
              value: typeHint,
              placeholder: '高魔奇幻 / 科幻 / 东方仙侠…',
              onChange: (event) => setTypeHint(event.target.value),
            })),
          h(Field, { label: '篇幅' },
            h('select', {
              className: 'wb-input',
              value: scale,
              onChange: (event) => setScale(event.target.value),
            },
            h('option', { value: 'brief' }, '简要（更快的初稿）'),
            h('option', { value: 'standard' }, '标准'),
            h('option', { value: 'deep' }, '详尽（更慢、更长）')))),
        h(Field, { label: '风格偏好（可留空）', hint: '会叠加在「世界类型」之上。' },
          h('input', {
            className: 'wb-input',
            value: styleHint,
            placeholder: '例如：冷峻克制，少用形容词，避免现代网络用语',
            onChange: (event) => setStyleHint(event.target.value),
          })),
        h('p', { className: 'wb-hint' },
          '生成过程会调用「设置 → 模型」中的默认模型，可能需要几十秒到几分钟。生成后可以在各分页继续手改，或在 AI 助手里继续对话补充。')));
    }

    function ImportDialog({ world, onClose, onSubmit }) {
      const [mode, setMode] = useState('new');
      const [name, setName] = useState('');
      const [text, setText] = useState('');
      const [fileName, setFileName] = useState('');
      const [reading, setReading] = useState(false);
      const fileRef = useRef(null);
      const onFile = async (event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        setReading(true);
        try {
          const content = await readTextFile(file);
          setText(content.slice(0, 80000));
          setFileName(file.name);
          if (!name) setName(file.name.replace(/\.[^.]+$/, '').slice(0, 80));
        } catch (error) {
          setFileName(`读取失败：${error?.message || error}`);
        } finally {
          setReading(false);
        }
      };
      const submit = () => {
        if (text.trim().length < 4) return;
        onSubmit({ mode, name: name.trim(), text, filename: fileName });
      };
      return h(Modal, {
        title: '导入世界观资料',
        description: '支持 JSON、Markdown、TXT、YAML、表格或散文。AI 会识别里面的类型、时代、事件、势力与规则，整理成统一格式；导入后仍可逐项修改。',
        onClose,
        wide: true,
        footer: h(React.Fragment, null,
          h(Btn, { onClick: onClose }, '取消'),
          h(Btn, { variant: 'primary', disabled: text.trim().length < 4, onClick: submit }, '识别并导入')),
      },
      h('div', { className: 'wb-form' },
        world
          ? h('div', { className: 'wb-radios' },
            h(Radio, { active: mode === 'new', onSelect: () => setMode('new'), title: '作为新世界观导入', description: '生成一份独立数据。' }),
            h(Radio, { active: mode === 'merge', onSelect: () => setMode('merge'), title: '合并进当前世界观', description: '把新资料按条目追加，已有内容保留。' }))
          : null,
        mode === 'new'
          ? h(Field, { label: '导入后的名称（可留空）', hint: '留空则由 AI 从资料里识别名称。' },
            h('input', {
              className: 'wb-input',
              value: name,
              placeholder: '例如：银月联邦',
              onChange: (event) => setName(event.target.value),
            }))
          : null,
        h('div', { className: 'wb-inline' },
          h(Btn, { size: 'sm', onClick: () => fileRef.current?.click(), disabled: reading }, reading ? '读取中…' : '从文件读取'),
          h('input', { ref: fileRef, type: 'file', accept: '.txt,.md,.markdown,.json,.yaml,.yml,.csv', style: { display: 'none' }, onChange: onFile }),
          h('span', { className: 'wb-hint' }, fileName || '支持 .txt / .md / .json / .yaml / .csv，最多 80,000 字符')),
        h(Field, { label: '资料内容', hint: '也可以直接粘贴设定文档、聊天记录或大纲。' },
          h('textarea', {
            className: 'wb-area wb-mono',
            style: { minHeight: 260 },
            value: text,
            placeholder: '把世界观资料粘贴到这里…',
            onChange: (event) => setText(event.target.value.slice(0, 80000)),
          })),
        h('p', { className: 'wb-hint' }, `当前 ${text.length.toLocaleString()} / 80,000 字符。导入会调用默认模型；如果原文是标准 JSON，也会先尝试本地清洗。`)));
    }

    function ExportDialog({ world, request, onClose, toast }) {
      const [format, setFormat] = useState('txt');
      const [includeChat, setIncludeChat] = useState(false);
      const [data, setData] = useState(null);
      const [loading, setLoading] = useState(true);
      const [error, setError] = useState('');
      useEffect(() => {
        let alive = true;
        setLoading(true);
        setError('');
        request('export', { id: world.id, format, includeChat })
          .then((value) => { if (alive) { setData(value); setLoading(false); } })
          .catch((failure) => { if (alive) { setError(failure.message || '导出失败'); setLoading(false); } });
        return () => { alive = false; };
      }, [format, includeChat, world.id, request]);
      const copy = async () => {
        if (!data?.text) return;
        const ok = await copyText(data.text);
        toast(ok ? '已复制到剪贴板' : '复制失败，请手动选择文本', ok ? 'ok' : 'error');
      };
      const download = () => {
        if (!data?.text) return;
        downloadText(data.text, data.filename, data.mime);
        toast(`已下载 ${data.filename}`);
      };
      return h(Modal, {
        title: '导出世界观',
        description: '纯文本适合直接阅读与投喂；Markdown 适合放进笔记；JSON 是完整结构化数据，可再次导入。',
        onClose,
        wide: true,
        footer: h(React.Fragment, null,
          h('label', { className: 'wb-inline', style: { cursor: 'pointer', fontSize: 12, color: 'var(--wb-dim)' } },
            h('input', { type: 'checkbox', checked: includeChat, onChange: (event) => setIncludeChat(event.target.checked) }),
            h('span', null, '包含 AI 对话记录')),
          h('span', { className: 'wb-spacer' }),
          h(Btn, { disabled: !data?.text, onClick: copy }, '复制'),
          h(Btn, { variant: 'primary', disabled: !data?.text, onClick: download }, '下载文件')),
      },
      h('div', { className: 'wb-form' },
        h('div', { className: 'wb-chips' },
          h(Chip, { active: format === 'txt', onClick: () => setFormat('txt') }, '纯文本 .txt'),
          h(Chip, { active: format === 'markdown', onClick: () => setFormat('markdown') }, 'Markdown .md'),
          h(Chip, { active: format === 'json', onClick: () => setFormat('json') }, 'JSON .json')),
        error ? h('p', { className: 'wb-hint', style: { color: 'var(--wb-danger)' } }, error) : null,
        loading
          ? h('div', { className: 'wb-hint', style: { display: 'flex', alignItems: 'center', gap: 8 } }, h('span', { className: 'wb-spinner' }), '正在生成预览…')
          : h('textarea', { className: 'wb-area wb-preview', readOnly: true, value: data?.text || '' }),
        h('p', { className: 'wb-hint' }, loading ? '' : `${data?.filename || ''} · ${(data?.text || '').length.toLocaleString()} 字符`)));
    }

    function EntryDialog({ target, entry, coords, onClose, onSave }) {
      const initial = entry || {};
      const [title, setTitle] = useState(initial.title || (target === 'composition' || target === 'setting' ? coords?.presetTitle || '' : ''));
      const [name, setName] = useState(initial.name || coords?.presetTitle || '');
      const [time, setTime] = useState(initial.time || '');
      const [span, setSpan] = useState(initial.span || '');
      const [description, setDescription] = useState(initial.description || '');
      const [impact, setImpact] = useState(initial.impact || '');
      const [content, setContent] = useState(initial.content || '');
      const [note, setNote] = useState(initial.note || '');
      const [x, setX] = useState(Math.round((Number.isFinite(initial.x) ? initial.x : coords?.x ?? 0.5) * 100));
      const [y, setY] = useState(Math.round((Number.isFinite(initial.y) ? initial.y : coords?.y ?? 0.5) * 100));

      const label = target === 'event' ? '事件' : target === 'timeline' ? '时代' : target === 'composition' ? '构成项' : target === 'setting' ? '设定项' : '地图标注';
      const submit = () => {
        if (target === 'event') {
          if (!title.trim()) return;
          onSave(target, {
            time: time.trim(),
            title: title.trim(),
            description: description.trim(),
            impact: impact.trim(),
          }, entry);
        } else if (target === 'timeline') {
          if (!name.trim()) return;
          onSave(target, { name: name.trim(), span: span.trim(), description: description.trim() }, entry);
        } else if (target === 'composition' || target === 'setting') {
          if (!title.trim()) return;
          onSave(target, { title: title.trim(), content: content.trim() }, entry);
        } else if (target === 'marker') {
          if (!name.trim()) return;
          onSave(target, { name: name.trim(), x: Math.min(100, Math.max(0, Number(x) || 0)) / 100, y: Math.min(100, Math.max(0, Number(y) || 0)) / 100, note: note.trim() }, entry);
        }
      };
      return h(Modal, {
        title: `${entry ? '编辑' : '添加'}${label}`,
        description: target === 'event' ? '时间里带年份，事件会自动按年份排序。' : target === 'marker' ? '坐标是相对地图的百分比，点击地图可以直接取点。' : null,
        onClose,
        footer: h(React.Fragment, null,
          h(Btn, { onClick: onClose }, '取消'),
          h(Btn, { variant: 'primary', onClick: submit }, entry ? '保存' : '添加')),
      },
      h('div', { className: 'wb-form' },
        target === 'event'
          ? h(React.Fragment, null,
            h(Field, { label: '时间', hint: '例如：第三纪元 1200 年 / 纪元前 300 年' }, h('input', { className: 'wb-input', autoFocus: true, value: time, onChange: (event) => setTime(event.target.value) })),
            h(Field, { label: '事件名' }, h('input', { className: 'wb-input', value: title, onChange: (event) => setTitle(event.target.value) })),
            h(Field, { label: '发生了什么' }, h('textarea', { className: 'wb-area', value: description, onChange: (event) => setDescription(event.target.value) })),
            h(Field, { label: '长期影响' }, h('textarea', { className: 'wb-area', style: { minHeight: 90 }, value: impact, onChange: (event) => setImpact(event.target.value) })))
          : null,
        target === 'timeline'
          ? h(React.Fragment, null,
            h('div', { className: 'wb-formrow' },
              h(Field, { label: '时代名称' }, h('input', { className: 'wb-input', autoFocus: true, value: name, onChange: (event) => setName(event.target.value) })),
              h(Field, { label: '时间跨度' }, h('input', { className: 'wb-input', value: span, placeholder: '例如：元年 — 600 年', onChange: (event) => setSpan(event.target.value) }))),
            h(Field, { label: '时代特征' }, h('textarea', { className: 'wb-area', value: description, onChange: (event) => setDescription(event.target.value) })))
          : null,
        (target === 'composition' || target === 'setting')
          ? h(React.Fragment, null,
            h(Field, { label: '标题' }, h('input', { className: 'wb-input', autoFocus: true, value: title, onChange: (event) => setTitle(event.target.value) })),
            h(Field, { label: '内容' }, h('textarea', { className: 'wb-area', style: { minHeight: 180 }, value: content, onChange: (event) => setContent(event.target.value) })))
          : null,
        target === 'marker'
          ? h(React.Fragment, null,
            h(Field, { label: '地点名' }, h('input', { className: 'wb-input', autoFocus: true, value: name, onChange: (event) => setName(event.target.value) })),
            h('div', { className: 'wb-formrow' },
              h(Field, { label: '横向位置（0-100%）' }, h('input', { className: 'wb-input', type: 'number', min: 0, max: 100, value: x, onChange: (event) => setX(event.target.value) })),
              h(Field, { label: '纵向位置（0-100%）' }, h('input', { className: 'wb-input', type: 'number', min: 0, max: 100, value: y, onChange: (event) => setY(event.target.value) }))),
            h(Field, { label: '标注说明' }, h('textarea', { className: 'wb-area', style: { minHeight: 90 }, value: note, onChange: (event) => setNote(event.target.value) })))
          : null));
    }

    function ConfirmDialog({ modal, onClose }) {
      return h(Modal, {
        title: modal.title,
        description: modal.description,
        onClose,
        footer: h(React.Fragment, null,
          h(Btn, { onClick: onClose }, '取消'),
          h(Btn, { variant: modal.danger ? 'danger' : 'primary', onClick: modal.onConfirm }, modal.confirmText || '确定')),
      },
      h('p', { className: 'wb-hint' }, '此操作在保存后不可撤销。'));
    }

    function RenameDialog({ world, onClose, onRename }) {
      const [name, setName] = useState(world?.name || '');
      const submit = () => onRename(name);
      return h(Modal, {
        title: '重命名世界观',
        onClose,
        footer: h(React.Fragment, null,
          h(Btn, { onClick: onClose }, '取消'),
          h(Btn, { variant: 'primary', onClick: submit }, '保存')),
      },
      h(Field, { label: '新名称' },
        h('input', {
          className: 'wb-input',
          autoFocus: true,
          value: name,
          onChange: (event) => setName(event.target.value),
          onKeyDown: (event) => { if (event.key === 'Enter') submit(); },
        })));
    }

    function WorldIcon({ size }) {
      return h('svg', {
        width: size, height: size, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true,
      },
      h('circle', { cx: 12, cy: 12, r: 8.2, stroke: 'currentColor', strokeWidth: 1.4 }),
      h('ellipse', { cx: 12, cy: 12, rx: 3.6, ry: 8.2, stroke: 'currentColor', strokeWidth: 1.2 }),
      h('path', { d: 'M4 12h16M5 8h14M5 16h14', stroke: 'currentColor', strokeWidth: 1.2, strokeLinecap: 'round' }),
      h('path', { d: 'M16.6 3.6l.8 1.7 1.7.8-1.7.8-.8 1.7-.8-1.7-1.7-.8 1.7-.8z', fill: 'currentColor' }));
    }

    const inject = ['slots', 'locale', 'connection'];

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register('worldbuilding', {
        zh: { 'panel.title': '世界观工坊' },
        en: { 'panel.title': 'Worldbuilding Studio' },
      }), 'worldbuilding: dictionaries');

      ctx.slots.inject('main', () => ctx.slots.register({
        name: 'main',
        key: 'worldbuilding',
        locale: 'worldbuilding',
      }, function MainEntry() {
        return h(WorldbuildingPage, { connection: ctx.connection });
      }));

      ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
        name: 'sidebar.panellist',
        id: 'worldbuilding',
        order: 24,
        locale: 'worldbuilding',
        label: () => '世界观工坊',
      }, WorldIcon));
    }

    return { inject, apply };
  },
});
