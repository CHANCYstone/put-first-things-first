import { parseDailyLine, validDailyDate, DAILY_PATH, LEGACY_DAILY_PATH } from './dailyWork';
import { taskTitle } from './tasksFormat';

export interface LogEntry {
 date: string; direction: string; text: string; source: string;
 line: number; kind: 'progress' | 'thought' | 'completed'; receipt?: string;
 block?: string;
}
const width = (line: string) => (/^[ \t]*/.exec(line)?.[0] ?? '').replace(/\t/g, '    ').length;
const clean = (text: string) => text.replace(/<!-- pftf-(?:receipt|daily):.*?-->/g, '').trim();

/** Read only explicit dated records; editing arbitrary prose does not fabricate work. */
export function readLogEntries(source: string, content: string, progressHeading: string): LogEntry[] {
 const entries: LogEntry[] = [];
 const lines = content.split('\n');
 const direction = source.split('/').pop()!.replace(/\.md$/, '');
 const tasks: { indent: number; title: string; block?: string }[] = [];
 let sectionLevel = 0, sectionKind: 'progress' | 'thought' = 'progress';
 let dayHeading: string | undefined;
 let fence = '', frontmatter = lines[0]?.trim() === '---';
 let continuation: { entry: LogEntry; indent: number } | undefined;
 for (let i = 0; i < lines.length; i++) {
  const line = lines[i]!;
  if (frontmatter) { if (i > 0 && /^(---|\.\.\.)\s*$/.test(line)) frontmatter = false; continue; }
  const delimiter = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
  if (delimiter) { if (!fence) fence = delimiter; else if (delimiter[0] === fence[0] && delimiter.length >= fence.length) fence = ''; continuation = undefined; continue; }
  if (fence) continue;
  if (source === DAILY_PATH || source === LEGACY_DAILY_PATH) {
   const action = parseDailyLine(line);
   if (action?.completed) {
    entries.push({ date: action.meta.completedAt ?? action.meta.date, direction: action.meta.parent?.title ?? '临时事项',
     text: `${action.title}${action.meta.result ? `；${action.meta.result}` : ''}${action.meta.completedAt ? '' : '（完成日期未记录，按计划日归档）'}`,
     source, line: i, kind: 'completed', receipt: action.meta.receipt });
   }
   continue;
  }
  const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
  if (heading) {
   tasks.length = 0; continuation = undefined;
   const level = heading[1]!.length, title = heading[2]!.trim();
   if (level <= sectionLevel) { sectionLevel = 0; sectionKind = 'progress'; dayHeading = undefined; }
   if ([progressHeading.toLowerCase(), '进展', '进展记录', '思考', '思考记录', 'progress'].includes(title.toLowerCase())) {
    sectionLevel = level; sectionKind = title.includes('思考') ? 'thought' : 'progress'; dayHeading = undefined;
   } else if (sectionLevel) {
    dayHeading = validDailyDate(title) ? title : undefined;
   }
   continue;
  }
  const task = /^\s*[-*+]\s+\[.\]\s+/.test(line);
  const indent = width(line);
  if (line.trim()) while (tasks.length && indent <= tasks[tasks.length - 1]!.indent) tasks.pop();
  if (task) {
   tasks.push({ indent, title: taskTitle(line), block: /\s\^([a-zA-Z0-9-]+)\s*$/.exec(line)?.[1] });
   continuation = undefined; continue;
  }
  const parent = tasks[tasks.length - 1];
  const dated = /^\s*(?:[-*+]\s+|⤷\s*)\[?(\d{4}-\d{2}-\d{2})\]?\s+(.*)$/.exec(line);
  if ((parent || sectionLevel) && dated && validDailyDate(dated[1]!)) {
   const body = clean(dated[2]!);
   const entry: LogEntry = { date: dated[1]!, direction: parent?.title ?? direction, text: body,
    source, line: i, kind: /^(?:\[思考\]|思考[:：])/.test(body) ? 'thought' : sectionKind,
    receipt: /<!-- pftf-receipt:([a-z0-9-]+) -->/.exec(line)?.[1], block: parent?.block };
   if (entry.text) entries.push(entry);
   continuation = { entry, indent }; continue;
  }
  if (continuation && line.trim() && indent > continuation.indent) {
   continuation.entry.text += '\n' + clean(line.trim()); continue;
  }
  continuation = undefined;
  // Notes can also use ## 思考 / ### YYYY-MM-DD with plain paragraphs or bullets.
  if (sectionLevel && dayHeading && line.trim()) {
   entries.push({ date: dayHeading, direction, text: clean(line.replace(/^\s*[-*+]\s+/, '')),
    source, line: i, kind: sectionKind });
  }
 }
 return entries;
}

/** The completion and its write-back receipt describe one event, not two. */
export function uniqueLogEntries(entries: LogEntry[]): LogEntry[] {
 const completions = new Set(entries.filter(e => e.kind === 'completed' && e.receipt).map(e => e.receipt));
 const seen = new Set<string>();
 return entries.filter(entry => {
  if (entry.kind !== 'completed' && entry.receipt && completions.has(entry.receipt)) return false;
  const key = `${entry.source}:${entry.line}:${entry.kind}`;
  if (seen.has(key)) return false;
  seen.add(key); return true;
 }).sort((a,b) => a.direction.localeCompare(b.direction, 'zh-CN') || a.source.localeCompare(b.source) || a.line - b.line);
}
const safeLabel = (text: string) => text.replace(/[\r\n]/g, ' ').replace(/\[/g, '［').replace(/\]/g, '］').replace(/\|/g, '｜');
export function renderLogBody(entries: LogEntry[]): string {
 if (!entries.length) return '今天还没有记录进展、思考或完成的行动。\n';
 const groups = new Map<string, LogEntry[]>();
 for (const entry of entries) { const group = groups.get(entry.direction) ?? []; group.push(entry); groups.set(entry.direction, group); }
 const output = [`共 ${entries.length} 条记录 · ${groups.size} 个方向`, ''];
 const labels = { progress: '进展', thought: '思考', completed: '完成' };
 for (const [direction, group] of groups) {
  output.push(`### ${safeLabel(direction)}`, '');
  for (const entry of group) {
   const source = entry.source.replace(/\.md$/, '');
   const link = `[[${source}${entry.block ? `#^${entry.block}` : ''}|来源]]`;
   const text = entry.text.replace(/<!-- pftf-daily-log:(?:begin|end) -->/g, marker => marker.replace('<', '&lt;')).replace(/\r?\n/g, '\n  ');
   output.push(`- **${labels[entry.kind]}** · ${text} ${link}`);
  }
  output.push('');
 }
 return output.join('\n');
}
