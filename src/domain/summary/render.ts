import { ISSUE_LABELS, STAGE_LABELS, formatCents, weekdayDate } from '@/lib/format';
import type { SummaryCase, WeekSummary } from './types';

/** A bulleted list, optionally under a bold label (one per asset manager). */
interface Group {
  label?: string;
  lines: string[];
}

interface Section {
  heading: string;
  /** Plain paragraphs, shown before the lists. */
  notes: string[];
  groups: Group[];
}

interface Doc {
  title: string;
  intro: string[];
  sections: Section[];
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function where(c: SummaryCase): string {
  const suite = c.suite === null ? '' : ` Ste ${c.suite}`;
  return `${c.tenant}, ${c.property ?? 'Unknown property'}${suite}`;
}

/** "Insurance" or "Monetary, AR $21,900"; the balance only matters on a monetary issue. */
function issue(c: SummaryCase): string {
  const label = ISSUE_LABELS[c.issueType];
  return c.issueType === 'monetary' && c.arCents !== null
    ? `${label}, AR ${formatCents(c.arCents)}`
    : label;
}

function overdueLine(c: SummaryCase): string {
  const days = -c.daysUntilDeadline!;
  return `${where(c)}: cure date ${weekdayDate(c.deadline!)} (${plural(days, 'day')} overdue), ${issue(c)}, with ${c.ownerName}`;
}

function dueLine(c: SummaryCase): string {
  return `${weekdayDate(c.deadline!)}: ${where(c)}, ${issue(c)}, with ${c.ownerName}`;
}

/** Lines under a person or team already say who has the case, so they say what stage it is in. */
function waitingLine(c: SummaryCase): string {
  const cure =
    c.deadlineStatus === 'overdue' || c.deadlineStatus === 'due_this_week'
      ? `, cure date ${weekdayDate(c.deadline!)}`
      : '';
  return `${where(c)}: ${STAGE_LABELS[c.stage]}${cure}, ${issue(c)}`;
}

function list(heading: string, lines: string[], empty: string): Section {
  return lines.length === 0
    ? { heading, notes: [empty], groups: [] }
    : { heading, notes: [], groups: [{ lines }] };
}

function buildDoc(s: WeekSummary): Doc {
  const { counts, money } = s;
  const intro = [
    `Week of ${weekdayDate(s.weekStart)} to ${weekdayDate(s.asOf)}`,
    s.scope === 'portfolio'
      ? 'Covers the whole portfolio.'
      : `Covers the properties ${s.viewer} manages.`,
  ];
  if (counts.inScope === 0) {
    return {
      title: 'Notice Desk weekly summary',
      intro,
      sections: [
        {
          heading: 'Nothing to report',
          notes: ['There are no cases on these properties, so there is nothing to summarise.'],
          groups: [],
        },
      ],
    };
  }

  const glance: Section = {
    heading: 'At a glance',
    notes: [],
    groups: [
      {
        lines: [
          `${plural(counts.open, 'open case')}: ${counts.waitingOnLegal} with Legal, ${counts.waitingOnAssetManagement} with asset management`,
          `${counts.overdue} overdue, ${counts.dueSoon} due in the next 7 days`,
          `${plural(counts.newCases, 'new case')} and ${plural(counts.stageChanges, 'stage change')} this week`,
        ],
      },
    ],
  };

  const am: Section = {
    heading: `Waiting on asset management (${counts.waitingOnAssetManagement})`,
    notes: counts.waitingOnAssetManagement === 0 ? ['None'] : [],
    groups: s.waitingOnAssetManagement.map((g) => ({
      label: `${g.person ?? 'No asset manager on file'}: ${plural(g.cases.length, 'case')}${g.overdue > 0 ? ` (${g.overdue} overdue)` : ''}`,
      lines: g.cases.map(waitingLine),
    })),
  };

  const balance = [
    `Live AR on the ${plural(money.openCases, 'open case')} in view: ${formatCents(money.liveArCents)}.`,
    'The data has no AR history, so this is the balance today, not movement since last week.',
  ];
  if (money.casesWithoutBalance > 0) {
    balance.push(`${plural(money.casesWithoutBalance, 'open case')} with no balance on file.`);
  }

  return {
    title: 'Notice Desk weekly summary',
    intro,
    sections: [
      glance,
      list(`Overdue (${counts.overdue})`, s.overdue.map(overdueLine), 'None'),
      list(`Due in the next 7 days (${counts.dueSoon})`, s.dueSoon.map(dueLine), 'None'),
      list(
        `New this week (${counts.newCases})`,
        s.newCases.map(
          (c) => `${weekdayDate(c.date)}: ${where(c)}, ${issue(c)}, with ${c.ownerName}`,
        ),
        'None this week',
      ),
      list(
        `Stage changes (${counts.stageChanges})`,
        s.stageChanges.map(
          (c) =>
            `${weekdayDate(c.date)}: ${where(c)}, ${STAGE_LABELS[c.from]} to ${STAGE_LABELS[c.to]}, by ${c.actor}`,
        ),
        'None this week',
      ),
      list(
        `Cured or closed this week (${counts.curedOrClosed})`,
        s.curedOrClosed.map((c) => `${weekdayDate(c.date)}: ${where(c)}, ${STAGE_LABELS[c.to]}`),
        'None this week',
      ),
      am,
      list(
        `Waiting on Legal (${counts.waitingOnLegal})`,
        s.waitingOnLegal.map(waitingLine),
        'None',
      ),
      { heading: 'Balances', notes: balance, groups: [] },
    ],
  };
}

/** Plain lines and "•" bullets only, so it pastes cleanly into any email client. */
export function renderPlainText(s: WeekSummary): string {
  const doc = buildDoc(s);
  const out: string[] = [`Subject: ${s.subject}`, '', doc.title, ...doc.intro];
  for (const section of doc.sections) {
    out.push('', section.heading.toUpperCase(), ...section.notes);
    for (const group of section.groups) {
      if (group.label) out.push(group.label);
      out.push(...group.lines.map((line) => `• ${line}`));
    }
  }
  return out.join('\n');
}

const escapeHtml = (text: string) =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

// Email clients ignore stylesheets, so the HTML carries its own inline styles.
const FONT = 'font-family:Arial,Helvetica,sans-serif;color:#111827;';
const P = `margin:0 0 6px;${FONT}font-size:14px;line-height:1.5;`;
const UL = `margin:0 0 6px;padding-left:20px;list-style:disc;${FONT}font-size:14px;line-height:1.5;`;

/** The body only (no <html> wrapper) so it can be pasted or embedded as-is. */
export function renderHtml(s: WeekSummary): string {
  const doc = buildDoc(s);
  const parts = [
    `<h1 style="margin:0 0 6px;${FONT}font-size:20px;font-weight:bold;color:#0e1b3d;">${escapeHtml(doc.title)}</h1>`,
    ...doc.intro.map((line) => `<p style="${P}color:#4b5563;">${escapeHtml(line)}</p>`),
  ];
  for (const section of doc.sections) {
    parts.push(
      `<h2 style="margin:18px 0 6px;${FONT}font-size:15px;font-weight:bold;color:#0e1b3d;">${escapeHtml(section.heading)}</h2>`,
      ...section.notes.map((note) => `<p style="${P}">${escapeHtml(note)}</p>`),
    );
    for (const group of section.groups) {
      if (group.label) {
        parts.push(`<p style="${P}font-weight:bold;">${escapeHtml(group.label)}</p>`);
      }
      const items = group.lines.map((line) => `<li>${escapeHtml(line)}</li>`).join('');
      parts.push(`<ul style="${UL}">${items}</ul>`);
    }
  }
  return `<div>${parts.join('')}</div>`;
}
