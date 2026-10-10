# Put First Things First

Put First Things First (PFTF) is a local task board for Obsidian. It keeps a short **Focus** list above three places for other work: **Work**, **Urgent**, and **Delegate**. You can plan a concrete action for a day without marking its longer project complete.

PFTF is a fork of [Focus First](https://github.com/christian-luger-at/obsidian-focus-first) by Christian Luger. It retains the original task parser, optional integrations, and MIT license while adding the Focus board, daily planning, progress notes, and daily logs.

## What it does

- Keep one to three tasks in Focus. Move cards between Focus, Work, Urgent, and Delegate by dragging or using the card menu. The board remembers your order.
- Open a linked project note from a card. Use **Progress** for a short, dated update without leaving the board.
- Plan independent daily actions or actions linked to a longer task. Completing a daily action records its result; the longer task stays open.
- Review a two-column daily planning view that places longer tasks beside the selected day's actions. Narrow panes stack the columns.
- Collect dated progress, thoughts, and completed actions into a Daily Log. Its generated section is updated from source notes; text outside that section is preserved.
- Optionally use task priorities, due dates, tags, the Tasks plugin, and the Calendar plugin. The older matrix and triage views remain available through commands.

## Start using it

1. Enable **Put First Things First** in **Settings → Community plugins**.
2. Select the PFTF ribbon icon to open **每日规划** (Daily planning), then select **长期任务** (Long-term tasks) for the Focus board.
3. Add ordinary Markdown checkbox tasks anywhere in the vault, for example `- [ ] Prepare investment memo`. By default PFTF scans the vault; you can restrict the task folder in settings.
4. Move up to three tasks into Focus. Select a title to open its project note or quick progress view, and select **Progress** to record a dated update.
5. Add a daily action from **每日规划**. Link it to a longer task when appropriate, then complete it with an optional result.

The default Focus tag is `#focus`. PFTF also reads common Tasks-style due dates and priorities. The Tasks plugin is optional; raw Tasks queries inside a `focus-first-tasks` code block require it.

## Files PFTF creates and changes

- On a new vault, daily actions are stored in `PFTF/Daily Work.md`; Daily Logs are created in `PFTF/Daily Log/YYYY-MM-DD.md`. PFTF creates the Daily Log for the current day after the layout is ready.
- Existing vaults with `2_Areas/任务与节奏/每日工作.md` or `2_Areas/任务与节奏/Daily Log/` continue using those locations. PFTF does not move or copy them.
- Adding a linked daily action may add a stable block ID to its parent task line. Progress and completion records are written to the linked project note when one exists, or under the task otherwise.
- Daily Logs contain a marked generated section and a separate area for your own notes. If an existing file at the target path lacks PFTF's markers, PFTF stops instead of replacing it.

PFTF reads local Markdown notes to find checkbox tasks and explicit dated progress. It runs locally and does not send vault data to a network service or include telemetry. The optional Tasks and Calendar integrations use locally installed Obsidian plugins.

The new planning and logging interface currently uses Chinese labels, with some English terms such as Focus and Progress. The inherited settings, matrix, and triage views retain their existing English and German translations.

## Installation and updates

After the community listing is published, install from **Settings → Community plugins** by searching for **Put First Things First**.

For a manual install, download `main.js`, `manifest.json`, and `styles.css` from a release whose tag matches the version in `manifest.json`. Put them in `<vault>/.obsidian/plugins/put-first-things-first/`, then reload Obsidian and enable the plugin. Do not copy `data.json` between vaults.

PFTF declares a minimum Obsidian version of 1.12.0 and supports desktop and mobile. The board also adapts to narrow panes. If you find a device-specific issue, include the Obsidian version and platform in your report.

## Development

Use Node.js and npm:

```sh
npm ci
npm run build
npm run lint
npm test
```

The build generates `main.js` at the repository root. Release assets are `main.js`, `manifest.json`, and `styles.css`. The generated bundle is excluded from Git and attached to the matching GitHub release.

## Attribution and license

PFTF is based on [Focus First](https://github.com/christian-luger-at/obsidian-focus-first) by Christian Luger. The original copyright notice is retained in [LICENSE](LICENSE). PFTF is distributed under the MIT license.
