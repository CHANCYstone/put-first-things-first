import { describe, it, expect } from 'vitest';
import { seedForQuadrant } from '../quadrantAdd';
import { DEFAULT_SETTINGS, FocusFirstSettings } from '../settings';

const NOW = new Date(2026, 8, 3);
const settings = (o: Partial<FocusFirstSettings> = {}): FocusFirstSettings => ({ ...DEFAULT_SETTINGS, ...o });

describe('seedForQuadrant — Eisenhower', () => {
	it('seeds each quadrant with the signals that classify it there', () => {
		expect(seedForQuadrant('Call', 'do', settings(), NOW)).toBe('Call ⏫ 📅 2026-09-03');
		expect(seedForQuadrant('Plan', 'schedule', settings(), NOW)).toBe('Plan ⏫');
		expect(seedForQuadrant('Book', 'delegate', settings(), NOW)).toBe('Book 📅 2026-09-03');
		expect(seedForQuadrant('Tidy', 'eliminate', settings(), NOW)).toBe('Tidy');
	});

	it('uses the first configured important priority when ⏫ does not count', () => {
		expect(seedForQuadrant('Plan', 'schedule', settings({ importantPriorities: ['🔺'] }), NOW)).toBe('Plan 🔺');
	});
});

describe('seedForQuadrant — Value/Effort', () => {
	it('writes the value and size tags of the slot', () => {
		const s = settings({ axisMode: 'valueEffort' });
		expect(seedForQuadrant('Win', 'do', s, NOW)).toBe('Win #highvalue #s');
		expect(seedForQuadrant('Sink', 'eliminate', s, NOW)).toBe('Sink #lowvalue #l');
	});
});
