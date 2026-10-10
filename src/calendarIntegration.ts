/**
 * Wiring to the Calendar plugin (liamcain/obsidian-calendar-plugin).
 *
 * Calendar announces its view opening with `calendar:open`, passing the mutable
 * array of sources it is about to render from. Pushing onto that array is the
 * one supported way in, so everything here hangs off that single event; if
 * Calendar is not installed the event never fires and nothing below runs.
 *
 * Two rough edges of theirs are handled here:
 *
 * - `calendar:open` fires once, when their view opens. On a normal start that is
 *   during layout restore, after every plugin's onload, so a listener registered
 *   in onload catches it. Enable this plugin later, though, and their view is
 *   already open and the event long gone — so an open view is restarted through
 *   its own ItemView lifecycle to make it ask again.
 * - Their `onFileModified` only re-renders when the edited file is a daily or
 *   weekly note. Editing a task in the inbox changes what the cells should say
 *   but not a daily note, so the redraw has to be asked for from this side.
 *
 * The quadrant colours are user settings, but the dots are drawn inside their
 * view, where no stylesheet of this plugin's can reach a configured value. They
 * are therefore set as custom properties on their view's own container element —
 * an ancestor of every cell, so the dots inherit them, and scoped tightly enough
 * that nothing outside that view is touched.
 */
import { App, EventRef, Plugin } from 'obsidian';
import { CalendarSource } from './calendarSource';
import type { Quadrant } from './matrixClassifier';

/** Their view type and event name, both constants in their bundle. */
const CALENDAR_VIEW_TYPE = 'calendar';
const CALENDAR_OPEN = 'calendar:open';

/** The part of their view this plugin touches. */
interface CalendarViewLike {
	calendar?: { tick(): void };
	contentEl?: HTMLElement;
	onOpen(): Promise<void>;
	onClose(): Promise<void>;
}

/** The configured quadrant colours, as the dots need them. */
export type QuadrantColors = Record<Quadrant, string>;

/** `calendar:open` is not in Obsidian's own event map, so it is declared here. */
interface CalendarEvents {
	on(name: typeof CALENDAR_OPEN, callback: (sources: CalendarSource[]) => void): EventRef;
}

function calendarViews(app: App): CalendarViewLike[] {
	return app.workspace
		.getLeavesOfType(CALENDAR_VIEW_TYPE)
		.map((leaf) => leaf.view as unknown as CalendarViewLike)
		.filter((view): view is CalendarViewLike =>
			typeof view?.onOpen === 'function' && typeof view?.onClose === 'function');
}

/**
 * Publishes the quadrant colours on every open Calendar view, and asks it to
 * redraw. Safe to call before their Svelte component exists — then there is
 * simply nothing to tick yet, and the colours are already in place for it.
 */
export function refreshCalendars(app: App, colors: QuadrantColors): void {
	for (const view of calendarViews(app)) {
		try {
			for (const [quadrant, color] of Object.entries(colors)) {
				view.contentEl?.style.setProperty(`--ff-quadrant-${quadrant}`, color);
			}
			view.calendar?.tick();
		} catch {
			// Their internals moved; a stale grid is not worth breaking a refresh over.
		}
	}
}

/**
 * Restarts an already-open Calendar view so it re-runs onOpen and fires
 * `calendar:open` again. Only their own ItemView lifecycle is used — no reaching
 * into their DOM — and a failure leaves the view exactly as it was.
 */
async function reopenCalendars(app: App): Promise<void> {
	for (const view of calendarViews(app)) {
		try {
			await view.onClose();
			await view.onOpen();
		} catch {
			// Leave their view alone; the source simply waits for the next open.
		}
	}
}

/**
 * Registers `source` with Calendar. Returns nothing: whether Calendar is there
 * at all only shows up as the event firing or not.
 */
export function registerCalendarSource(
	plugin: Plugin,
	source: CalendarSource,
	colors: () => QuadrantColors,
): void {
	const events = plugin.app.workspace as unknown as CalendarEvents;
	plugin.registerEvent(
		events.on(CALENDAR_OPEN, (sources: CalendarSource[]) => {
			if (Array.isArray(sources) && !sources.includes(source)) sources.push(source);
			// Their view exists by now but its grid does not, so this only lays the
			// colours down for the cells about to be built.
			refreshCalendars(plugin.app, colors());
		}),
	);

	// Already open — which on a cold start it is not, since layout restore runs
	// after onload, so this is the "enabled or updated mid-session" case.
	if (plugin.app.workspace.getLeavesOfType(CALENDAR_VIEW_TYPE).length > 0) {
		void reopenCalendars(plugin.app);
	}
}
