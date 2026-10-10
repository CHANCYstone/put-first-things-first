/**
 * A task's home note: the first `[[wikilink]]` in its line that resolves to a
 * note in the vault. A one-line task ("call the mayor") has none and needs
 * none. A task that has grown into a matter of weeks — "learn AI", "build the
 * bridge" — gets a note of its own, linked from the line, and that note becomes
 * where its relations live (links, backlinks, graph) and where its progress
 * log is kept, so finishing the task leaves the note behind as the record.
 */
import { App, TFile } from 'obsidian';

export interface WikiLink {
	target: string;
	alias?: string;
}

// `[[target]]`, `[[target|alias]]`, `[[target#heading]]`, `[[target#heading|alias]]`.
export const WIKILINK_RE = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/u;

/** The first wikilink on a line, if any. */
export function firstWikiLink(line: string): WikiLink | undefined {
	const match = WIKILINK_RE.exec(line);
	if (!match?.[1]) return undefined;
	const target = match[1].trim();
	const alias = match[2]?.trim();
	return { target, alias: alias || undefined };
}

/** Replaces every wikilink with its display text (alias, else target). */
export function unlinkText(text: string): string {
	return text.replace(new RegExp(WIKILINK_RE.source, 'gu'), (_m, target: string, alias?: string) => (alias ?? target).trim());
}

/** The note the task's first wikilink points to, when it exists. */
export function resolveHomeNote(app: App, line: string, sourcePath: string): TFile | undefined {
	const link = firstWikiLink(line);
	if (!link) return undefined;
	return app.metadataCache.getFirstLinkpathDest(link.target, sourcePath) ?? undefined;
}
