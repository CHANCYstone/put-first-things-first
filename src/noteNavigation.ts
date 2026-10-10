import { App, MarkdownView, TFile } from 'obsidian';

/** Opens a note in the active pane. */
export async function openFile(app: App, file: TFile): Promise<void> {
	await app.workspace.getLeaf(false).openFile(file);
}

/** Opens a note in the active pane with the cursor on `line`, scrolled into view. */
export async function openFileAtLine(app: App, file: TFile, line: number): Promise<void> {
	const leaf = app.workspace.getLeaf(false);
	await leaf.openFile(file);
	const view = leaf.view;
	if (view instanceof MarkdownView) {
		view.editor.setCursor({ line, ch: 0 });
		view.editor.scrollIntoView({ from: { line, ch: 0 }, to: { line, ch: 0 } }, true);
	}
}
