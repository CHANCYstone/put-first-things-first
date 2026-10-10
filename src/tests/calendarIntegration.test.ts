/**
 * Tests for calendarIntegration.ts — the handshake with the Calendar plugin.
 * Calendar itself is stubbed down to the two things this plugin relies on: the
 * `calendar:open` event carrying its mutable sources array, and a view whose
 * ItemView lifecycle can be restarted.
 */

import { describe, it, expect, vi } from 'vitest';
import { registerCalendarSource, refreshCalendars, type QuadrantColors } from '../calendarIntegration';
import type { CalendarSource } from '../calendarSource';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const COLORS: QuadrantColors = {
	do: '#c92a2a', schedule: '#1864ab', delegate: '#e67700', eliminate: '#868e96',
};

const source: CalendarSource = {
	getDailyMetadata: () => Promise.resolve({ classes: [], dataAttributes: {}, dots: [] }),
	getWeeklyMetadata: () => Promise.resolve({ classes: [], dataAttributes: {}, dots: [] }),
};

/** A stand-in for Calendar's view: a Svelte handle, a container, and a lifecycle. */
function makeCalendarView(overrides: Record<string, unknown> = {}) {
	return {
		calendar: { tick: vi.fn() },
		contentEl: { style: { setProperty: vi.fn() } },
		onOpen: vi.fn(() => Promise.resolve()),
		onClose: vi.fn(() => Promise.resolve()),
		...overrides,
	};
}

/**
 * A fake app. `views` are returned for the "calendar" leaf type only, so a test
 * can also assert that leaves of other types are left alone.
 */
function makeApp(views: unknown[] = [], otherViews: unknown[] = []) {
	const handlers = new Map<string, (...args: never[]) => void>();
	return {
		handlers,
		app: {
			workspace: {
				on: (name: string, cb: (...args: never[]) => void) => {
					handlers.set(name, cb);
					return { name };
				},
				getLeavesOfType: (type: string) =>
					(type === 'calendar' ? views : otherViews).map((view) => ({ view })),
			},
		},
	};
}

function makePlugin(app: unknown) {
	return { app, registerEvent: vi.fn() } as never;
}

// ---------------------------------------------------------------------------
// registerCalendarSource
// ---------------------------------------------------------------------------

describe('registerCalendarSource', () => {
	it('pushes the source onto the array Calendar hands out', () => {
		const { app, handlers } = makeApp();
		registerCalendarSource(makePlugin(app), source, () => COLORS);

		const sources: CalendarSource[] = [];
		handlers.get('calendar:open')?.(sources as never);

		expect(sources).toEqual([source]);
	});

	it('leaves Calendar\'s own sources in place', () => {
		const { app, handlers } = makeApp();
		registerCalendarSource(makePlugin(app), source, () => COLORS);

		const theirs = { getDailyMetadata: vi.fn(), getWeeklyMetadata: vi.fn() } as never;
		const sources: CalendarSource[] = [theirs];
		handlers.get('calendar:open')?.(sources as never);

		expect(sources).toEqual([theirs, source]);
	});

	it('does not add itself twice if their view re-opens with the same array', () => {
		const { app, handlers } = makeApp();
		registerCalendarSource(makePlugin(app), source, () => COLORS);

		const sources: CalendarSource[] = [];
		handlers.get('calendar:open')?.(sources as never);
		handlers.get('calendar:open')?.(sources as never);

		expect(sources).toHaveLength(1);
	});

	it('survives a payload that is not an array', () => {
		const { app, handlers } = makeApp();
		registerCalendarSource(makePlugin(app), source, () => COLORS);
		expect(() => handlers.get('calendar:open')?.(undefined as never)).not.toThrow();
	});

	it('registers the listener for cleanup', () => {
		const { app } = makeApp();
		const plugin = makePlugin(app) as unknown as { registerEvent: ReturnType<typeof vi.fn> };
		registerCalendarSource(plugin as never, source, () => COLORS);
		expect(plugin.registerEvent).toHaveBeenCalledOnce();
	});

	it('lays the quadrant colours down on the view that just opened', () => {
		const view = makeCalendarView();
		const { app, handlers } = makeApp([view]);
		registerCalendarSource(makePlugin(app), source, () => COLORS);

		handlers.get('calendar:open')?.([] as never);

		expect(view.contentEl.style.setProperty).toHaveBeenCalledWith('--ff-quadrant-do', '#c92a2a');
		expect(view.contentEl.style.setProperty).toHaveBeenCalledWith('--ff-quadrant-eliminate', '#868e96');
	});

	it('leaves a view that is already open alone on a cold start', () => {
		const { app } = makeApp();
		const view = makeCalendarView();
		registerCalendarSource(makePlugin(app), source, () => COLORS);
		expect(view.onClose).not.toHaveBeenCalled();
	});

	it('restarts an open view, so enabling the plugin mid-session still registers', async () => {
		const view = makeCalendarView();
		const { app } = makeApp([view]);
		registerCalendarSource(makePlugin(app), source, () => COLORS);

		await vi.waitFor(() => expect(view.onOpen).toHaveBeenCalled());
		expect(view.onClose).toHaveBeenCalledBefore(view.onOpen);
	});

	it('leaves the view as it was when restarting it throws', async () => {
		const view = makeCalendarView({ onClose: vi.fn(() => Promise.reject(new Error('gone'))) });
		const { app } = makeApp([view]);
		expect(() => registerCalendarSource(makePlugin(app), source, () => COLORS)).not.toThrow();
		await vi.waitFor(() => expect(view.onClose).toHaveBeenCalled());
	});
});

// ---------------------------------------------------------------------------
// refreshCalendars
// ---------------------------------------------------------------------------

describe('refreshCalendars', () => {
	it('sets every quadrant colour and redraws', () => {
		const view = makeCalendarView();
		const { app } = makeApp([view]);

		refreshCalendars(app as never, COLORS);

		expect(view.contentEl.style.setProperty).toHaveBeenCalledTimes(4);
		expect(view.contentEl.style.setProperty).toHaveBeenCalledWith('--ff-quadrant-schedule', '#1864ab');
		expect(view.calendar.tick).toHaveBeenCalledOnce();
	});

	it('does nothing when Calendar is not installed', () => {
		const { app } = makeApp([]);
		expect(() => refreshCalendars(app as never, COLORS)).not.toThrow();
	});

	it('ignores leaves that are not Calendar views', () => {
		const other = makeCalendarView();
		const { app } = makeApp([], [other]);
		refreshCalendars(app as never, COLORS);
		expect(other.calendar.tick).not.toHaveBeenCalled();
	});

	it('paints a view whose grid does not exist yet, with nothing to tick', () => {
		const view = makeCalendarView({ calendar: undefined });
		const { app } = makeApp([view]);
		refreshCalendars(app as never, COLORS);
		expect(view.contentEl.style.setProperty).toHaveBeenCalledTimes(4);
	});

	it('skips a view that is missing the lifecycle this plugin relies on', () => {
		const stranger = { calendar: { tick: vi.fn() } };
		const { app } = makeApp([stranger]);
		refreshCalendars(app as never, COLORS);
		expect(stranger.calendar.tick).not.toHaveBeenCalled();
	});

	it('swallows a redraw that throws, rather than breaking the refresh', () => {
		const view = makeCalendarView({
			calendar: { tick: vi.fn(() => { throw new Error('their internals moved'); }) },
		});
		const { app } = makeApp([view]);
		expect(() => refreshCalendars(app as never, COLORS)).not.toThrow();
	});
});
