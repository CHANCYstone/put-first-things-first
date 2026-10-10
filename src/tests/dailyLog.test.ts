import { describe, it, expect, vi } from 'vitest';
import type { App } from 'obsidian';
import { TFile, TFolder } from './__mocks__/obsidian';
import { DEFAULT_SETTINGS } from '../settings';
import { dailyLine, DAILY_PATH, LEGACY_DAILY_PATH } from '../dailyWork';
import { readLogEntries, uniqueLogEntries } from '../dailyLogEntries';
import { DailyLogService, dailyLogPath, updateLogContent, LOG_BEGIN, LOG_END, LEGACY_DAILY_LOG_FOLDER } from '../dailyLog';
import { formatIsoDate } from '../dateUtils';
const today = formatIsoDate(new Date());
const heading = DEFAULT_SETTINGS.progressHeading;

function fixture(initial: Record<string,string> = {}, start = today) {
 const contents = new Map(Object.entries(initial));
 const files = new Map(Object.keys(initial).map(path => [path,new TFile(path)]));
 const folders = new Map<string,TFolder>();
 const process = vi.fn(async (file: TFile, fn: (s:string)=>string) => { const next=fn(contents.get(file.path)!); contents.set(file.path,next); return next; });
 const app = { vault: {
  getMarkdownFiles:()=>[...files.values()], getAbstractFileByPath:(path:string)=>files.get(path)??folders.get(path),
  read: async(file:TFile)=>contents.get(file.path)!, process,
  createFolder:async(path:string)=>{folders.set(path,new TFolder(path));},
  create:async(path:string,content:string)=>{const file=new TFile(path);files.set(path,file);contents.set(path,content);return file;},
 }} as unknown as App;
 const service = new DailyLogService(app,()=>DEFAULT_SETTINGS,start);
 const edit=(path:string,text:string)=>{if(!files.has(path))files.set(path,new TFile(path));contents.set(path,text);service.invalidate(path);};
 return {app,service,contents,files,edit,process};
}

describe('dated work extraction',()=>{
 it('reads task progress and thoughts without requiring task completion',()=>{
  const rows=readLogEntries('Work.md',`- [ ] 方向 A #focus ^a\n    - ${today} 推进到第二步\n    - ${today} 思考：先验证假设\n- [x] 方向 B\n    ⤷ [${today}] 完成讨论`,heading);
  expect(rows.map(r=>[r.direction,r.kind,r.text])).toEqual([['方向 A','progress','推进到第二步'],['方向 A','thought','思考：先验证假设'],['方向 B','progress','完成讨论']]);
  expect(rows[0]?.block).toBe('a');
 });
 it('reads standalone progress and thought sections and date headings',()=>{
  const rows=readLogEntries('项目/新方向.md',`# 新方向\n## ${heading}\n- ${today} 更新模型\n## 思考\n### ${today}\n这一假设需要验证\n- 先做小实验\n## 其他\n- ${today} 不属于工作日志`,heading);
  expect(rows).toHaveLength(3);expect(rows[1]?.kind).toBe('thought');expect(rows.every(r=>r.direction==='新方向')).toBe(true);
 });
 it('keeps continuation details but excludes fenced examples, frontmatter and undated notes',()=>{
  const rows=readLogEntries('P.md',`---\nexample: yes\n---\n## ${heading}\n\`\`\`md\n- ${today} 示例\n\`\`\`\n- 无日期\n- ${today} 主要结果\n  细节\n  - 支持证据\n## 其他\n无关`,heading);
  expect(rows).toHaveLength(1);expect(rows[0]?.text).toBe('主要结果\n细节\n- 支持证据');
 });
 it('ignores invalid dates and unchecked tasks in a progress section',()=>{
  expect(readLogEntries('P.md',`## ${heading}\n- 2026-02-30 无效\n- [ ] 计划明天做`,heading)).toEqual([]);
 });
 it('does not duplicate completion receipts but retains two genuinely separate equal notes',()=>{
  const receipt='pftf-receipt-a';
  const action=dailyLine({title:'完成测算',completed:true,meta:{id:'pftf-a',date:today,completedAt:today,parent:{block:'a',title:'方向 A'},receipt,result:'完成两版'}});
  const rows=[...readLogEntries(DAILY_PATH,action,heading),...readLogEntries('Work.md',`- [ ] 方向 A\n    - ${today} 完成每日行动：完成测算 <!-- pftf-receipt:${receipt} -->\n    - ${today} 继续核对\n    - ${today} 继续核对`,heading)];
  expect(uniqueLogEntries(rows)).toHaveLength(3);expect(uniqueLogEntries(rows).filter(r=>r.kind==='completed')).toHaveLength(1);
 });
 it('places completed work on its actual completion date, not scheduled date',()=>{
  const action=dailyLine({title:'晚完成',completed:true,meta:{id:'pftf-a',date:'2026-01-01',completedAt:today}});
  expect(readLogEntries(DAILY_PATH,action,heading)[0]?.date).toBe(today);
 });
 it('labels manual checkmarks honestly when completion date is missing',()=>{
  const action=dailyLine({title:'手工勾选',completed:true,meta:{id:'pftf-a',date:today}});
  expect(readLogEntries(DAILY_PATH,action,heading)[0]?.text).toContain('完成日期未记录');
 });
});

describe('daily log synchronization',()=>{
 it('continues writing to an existing legacy log folder and reads legacy daily work',async()=>{
  const legacyLog=dailyLogPath(today,LEGACY_DAILY_LOG_FOLDER);
  const action=dailyLine({title:'旧行动',completed:true,meta:{id:'pftf-old',date:today,completedAt:today}});
  const v=fixture({[LEGACY_DAILY_PATH]:action,[legacyLog]:`# 旧日志\n${LOG_BEGIN}\n${LOG_END}\n手写保留`});
  await v.service.sync();
  expect(v.contents.get(legacyLog)).toContain('旧行动');
  expect(v.contents.get(legacyLog)).toContain('手写保留');
  expect(v.files.has(dailyLogPath(today))).toBe(false);
 });
 it('creates one daily file and groups progress and completed temporary work',async()=>{
  const v=fixture({'Tasks.md':`- [ ] 方向 A\n    - ${today} 做了实验`,[DAILY_PATH]:dailyLine({title:'临时会议',completed:true,meta:{id:'pftf-a',date:today,completedAt:today,result:'确认分工'}})});
  await v.service.sync();const text=v.contents.get(dailyLogPath(today))!;
  expect(text).toContain('### 方向 A');expect(text).toContain('### 临时事项');expect(text).toContain('确认分工');expect(text).toContain('[[Tasks|来源]]');
 });
 it('updates edits in place, is idempotent, and preserves user-written text exactly',async()=>{
  const v=fixture({'Tasks.md':`- [ ] A\n    - ${today} 初稿`});await v.service.sync();
  const path=dailyLogPath(today);v.contents.set(path,'开头手写\n'+v.contents.get(path)!+'结尾手写\r\n');
  v.edit('Tasks.md',`- [ ] A\n    - ${today} 修订稿`);await v.service.sync();
  const text=v.contents.get(path)!;expect(text).not.toContain('初稿');expect(text).toContain('修订稿');expect(text.startsWith('开头手写\n')).toBe(true);expect(text.endsWith('结尾手写\r\n')).toBe(true);
  v.process.mockClear();await v.service.sync();expect(v.process).not.toHaveBeenCalled();
 });
 it('reconciles deleted records and re-dated records without deleting manual history',async()=>{
  const old='2026-01-01';const v=fixture({'Tasks.md':`- [ ] A\n    - ${old} 旧记录`},old);
  await v.service.sync();v.contents.set(dailyLogPath(old),v.contents.get(dailyLogPath(old))!+'手写保留');
  v.edit('Tasks.md',`- [ ] A\n    - ${today} 旧记录`);await v.service.sync();
  expect(v.contents.get(dailyLogPath(old))).not.toContain('**进展**');expect(v.contents.get(dailyLogPath(old))).toContain('手写保留');expect(v.contents.get(dailyLogPath(today))).toContain('旧记录');
  v.files.delete('Tasks.md');v.contents.delete('Tasks.md');await v.service.sync();expect(v.contents.get(dailyLogPath(today))).not.toContain('旧记录');
 });
 it('updates source links after rename instead of adding duplicate entries',async()=>{
  const v=fixture({'Tasks.md':`- [ ] A\n    - ${today} 记录`});await v.service.sync();
  v.files.delete('Tasks.md');const text=v.contents.get('Tasks.md')!;v.contents.delete('Tasks.md');v.edit('Moved.md',text);await v.service.sync();
  const log=v.contents.get(dailyLogPath(today))!;expect(log).toContain('[[Moved|来源]]');expect(log).not.toContain('[[Tasks|来源]]');expect(log.match(/\*\*进展\*\*/g)).toHaveLength(1);
 });
 it('does not backfill before activation unless that date is explicitly opened',async()=>{
  const v=fixture({'Tasks.md':'- [ ] A\n    - 2026-01-01 历史'});await v.service.sync();expect(v.files.has(dailyLogPath('2026-01-01'))).toBe(false);
  await v.service.sync('2026-01-01');expect(v.contents.get(dailyLogPath('2026-01-01'))).toContain('历史');
 });
 it('catches up days since activation when reopened after an offline interval',async()=>{
  const v=fixture({'Tasks.md':'- [ ] A\n    - 2026-01-02 离线期间记录'},'2026-01-01');await v.service.sync();expect(v.contents.get(dailyLogPath('2026-01-02'))).toContain('离线期间记录');
 });
 it('preserves legacy vault source exclusions without imposing them on new vaults',async()=>{
  const legacyPath=dailyLogPath(today,LEGACY_DAILY_LOG_FOLDER);
  const old=fixture({'09_AI输出/backup/P.md':`## 思考\n- ${today} 备份内容`,'000_Agent/P.md':`## 思考\n- ${today} 内部记录`,[legacyPath]:`# 旧日志\n${LOG_BEGIN}\n${LOG_END}\n`});
  await old.service.sync();
  expect(old.contents.get(legacyPath)).not.toContain('备份内容');
  expect(old.contents.get(legacyPath)).not.toContain('内部记录');
  const fresh=fixture({'09_AI输出/backup/P.md':`## 思考\n- ${today} 新用户记录`});
  await fresh.service.sync();
  expect(fresh.contents.get(dailyLogPath(today))).toContain('新用户记录');
 });
 it('refuses to overwrite an existing unowned daily file',async()=>{
  const path=dailyLogPath(today);const v=fixture({[path]:'# 我的日志\n重要内容'});await expect(v.service.sync()).rejects.toThrow('标记');expect(v.contents.get(path)).toBe('# 我的日志\n重要内容');
 });
 it('serializes concurrent sync requests without duplicating files or entries',async()=>{
  const v=fixture({'Tasks.md':`- [ ] A\n    - ${today} 一条`});await Promise.all([v.service.sync(),v.service.sync(),v.service.sync()]);
  expect(v.contents.get(dailyLogPath(today))!.match(/\*\*进展\*\*/g)).toHaveLength(1);
 });
 it('does not rewrite reports after a source read failure and can retry',async()=>{
  const v=fixture({'Tasks.md':`- [ ] A\n    - ${today} 已保存`});await v.service.sync();const before=v.contents.get(dailyLogPath(today));
  v.service.invalidate('Tasks.md');vi.spyOn(v.app.vault,'read').mockRejectedValueOnce(new Error('disk'));
  await expect(v.service.sync()).rejects.toThrow('disk');expect(v.contents.get(dailyLogPath(today))).toBe(before);
  await v.service.sync();expect(v.contents.get(dailyLogPath(today))).toBe(before);
 });
 it('stops queued writes when the plugin unloads',async()=>{
  const v=fixture({'Tasks.md':`- [ ] A\n    - ${today} 记录`});v.service.stop();await v.service.sync();expect(v.files.has(dailyLogPath(today))).toBe(false);
 });
 it.each([`${LOG_BEGIN}x`,`${LOG_END}x${LOG_BEGIN}`,`${LOG_BEGIN}${LOG_BEGIN}${LOG_END}`])('refuses damaged delimiters: %s',text=>{
  expect(()=>updateLogContent(text,'new')).toThrow('标记');
 });
});

describe('automatic save integration',()=>{
 it('listens for saves, updates without a manual command, ignores its own writes, and stops on unload',async()=>{
  const { registerDailyLog } = await import('../dailyLog');
  const v=fixture({'Tasks.md':`- [ ] A\n    - ${today} 首次记录`});
  const handlers=new Map<string,(file: {path:string},old?:string)=>void>();
  const cleanups:(()=>void)[]=[];
  const vault=v.app.vault as unknown as {on:(name:string,fn:(file:{path:string},old?:string)=>void)=>unknown};
  vault.on=(name,fn)=>{handlers.set(name,fn);return {};};
  Object.assign(v.app,{workspace:{onLayoutReady:(fn:()=>void)=>fn()}});
  vi.stubGlobal('window',{setInterval:()=>1});
  try {
   const plugin={app:v.app,settings:DEFAULT_SETTINGS,registerEvent:()=>{},registerInterval:()=>{},register:(fn:()=>void)=>cleanups.push(fn)};
   const service=registerDailyLog(plugin as never);
   await service.sync();
   v.contents.set('Tasks.md',`- [ ] A\n    - ${today} 保存后的新进展`);
   handlers.get('modify')!({path:'Tasks.md'});
   // Await the queued background save, without requesting a second sync.
   for(let i=0;i<40;i++)await Promise.resolve();
   expect(v.contents.get(dailyLogPath(today))).toContain('保存后的新进展');
   v.process.mockClear();handlers.get('modify')!({path:dailyLogPath(today)});
   for(let i=0;i<20;i++)await Promise.resolve();expect(v.process).not.toHaveBeenCalled();
   cleanups.forEach(fn=>fn());
   v.contents.set('Tasks.md',`- [ ] A\n    - ${today} 停用后`);
   handlers.get('modify')!({path:'Tasks.md'});
   for(let i=0;i<20;i++)await Promise.resolve();expect(v.contents.get(dailyLogPath(today))).not.toContain('停用后');
  } finally {vi.unstubAllGlobals();}
 });
});
