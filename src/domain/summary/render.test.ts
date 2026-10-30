import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildPersonas } from '@/lib/persona/personas';
import { readSeedDir } from '@/lib/seed';
import { buildLookups } from '@/store/lookups';
import { buildWeekSummary } from './build';
import { renderHtml, renderPlainText } from './render';
import type { SummaryCase, WeekSummary } from './types';

const sc = (over: Partial<SummaryCase> = {}): SummaryCase => ({
  caseId: 'N-1',
  tenant: 'Acme LLC',
  property: 'Harbor Commons',
  suite: '104',
  stage: 'notice_to_cure',
  issueType: 'monetary',
  owner: 'legal',
  ownerName: 'Legal',
  deadline: null,
  daysUntilDeadline: null,
  deadlineStatus: 'none',
  arCents: 2190000,
  ...over,
});

const quiet = (over: Partial<WeekSummary> = {}): WeekSummary => ({
  asOf: '2026-10-13',
  weekStart: '2026-10-07',
  subject: 'Notice Desk weekly summary, week ending Tue, Oct 13',
  viewer: 'Maya',
  scope: 'portfolio',
  counts: {
    inScope: 3,
    open: 1,
    overdue: 0,
    dueSoon: 0,
    waitingOnLegal: 0,
    waitingOnAssetManagement: 0,
    newCases: 0,
    stageChanges: 0,
    curedOrClosed: 0,
  },
  newCases: [],
  stageChanges: [],
  curedOrClosed: [],
  overdue: [],
  dueSoon: [],
  waitingOnAssetManagement: [],
  waitingOnLegal: [],
  money: { liveArCents: 0, openCases: 1, casesWithoutBalance: 0, historyAvailable: false },
  ...over,
});

const busy = (): WeekSummary =>
  quiet({
    scope: 'own_properties',
    viewer: 'Ann Adams',
    counts: {
      inScope: 4,
      open: 3,
      overdue: 1,
      dueSoon: 1,
      waitingOnLegal: 1,
      waitingOnAssetManagement: 2,
      newCases: 1,
      stageChanges: 1,
      curedOrClosed: 1,
    },
    overdue: [
      sc({ deadline: '2026-10-06', daysUntilDeadline: -7, deadlineStatus: 'overdue' }),
      sc({
        caseId: 'N-9',
        suite: null,
        property: null,
        issueType: 'insurance',
        arCents: 5,
        deadline: '2026-10-06',
        daysUntilDeadline: -7,
        deadlineStatus: 'overdue',
      }),
    ],
    dueSoon: [
      sc({ deadline: '2026-10-14', daysUntilDeadline: 1, deadlineStatus: 'due_this_week' }),
    ],
    newCases: [{ ...sc({ issueType: 'monetary', arCents: null }), date: '2026-10-12' }],
    stageChanges: [
      { ...sc(), date: '2026-10-13', from: 'notice_to_cure', to: 'cured', actor: 'Maya' },
    ],
    curedOrClosed: [
      { ...sc(), date: '2026-10-13', from: 'notice_to_cure', to: 'cured', actor: 'Maya' },
    ],
    waitingOnAssetManagement: [
      {
        person: 'Ann Adams',
        overdue: 1,
        cases: [
          sc({
            owner: 'asset_management',
            ownerName: 'Ann Adams',
            deadline: '2026-10-06',
            daysUntilDeadline: -7,
            deadlineStatus: 'overdue',
          }),
          sc({ owner: 'asset_management', ownerName: 'Ann Adams', stage: 'default' }),
        ],
      },
      { person: null, overdue: 0, cases: [sc({ owner: 'asset_management' })] },
    ],
    waitingOnLegal: [
      sc({ deadline: '2026-10-14', daysUntilDeadline: 1, deadlineStatus: 'due_this_week' }),
    ],
    money: { liveArCents: 2190005, openCases: 3, casesWithoutBalance: 2, historyAvailable: false },
  });

describe('renderPlainText', () => {
  it('reads as plain lines with the subject on top', () => {
    expect(renderPlainText(busy())).toBe(
      [
        'Subject: Notice Desk weekly summary, week ending Tue, Oct 13',
        '',
        'Notice Desk weekly summary',
        'Week of Wed, Oct 7 to Tue, Oct 13',
        'Covers the properties Ann Adams manages.',
        '',
        'AT A GLANCE',
        '• 3 open cases: 1 with Legal, 2 with asset management',
        '• 1 overdue, 1 due in the next 7 days',
        '• 1 new case and 1 stage change this week',
        '',
        'OVERDUE (1)',
        '• Acme LLC, Harbor Commons Ste 104: cure date Tue, Oct 6 (7 days overdue), Monetary, AR $21,900, with Legal',
        '• Acme LLC, Unknown property: cure date Tue, Oct 6 (7 days overdue), Insurance, with Legal',
        '',
        'DUE IN THE NEXT 7 DAYS (1)',
        '• Wed, Oct 14: Acme LLC, Harbor Commons Ste 104, Monetary, AR $21,900, with Legal',
        '',
        'NEW THIS WEEK (1)',
        '• Mon, Oct 12: Acme LLC, Harbor Commons Ste 104, Monetary, with Legal',
        '',
        'STAGE CHANGES (1)',
        '• Tue, Oct 13: Acme LLC, Harbor Commons Ste 104, Notice to Cure to Cured, by Maya',
        '',
        'CURED OR CLOSED THIS WEEK (1)',
        '• Tue, Oct 13: Acme LLC, Harbor Commons Ste 104, Cured',
        '',
        'WAITING ON ASSET MANAGEMENT (2)',
        'Ann Adams: 2 cases (1 overdue)',
        '• Acme LLC, Harbor Commons Ste 104: Notice to Cure, cure date Tue, Oct 6, Monetary, AR $21,900',
        '• Acme LLC, Harbor Commons Ste 104: Default, Monetary, AR $21,900',
        'No asset manager on file: 1 case',
        '• Acme LLC, Harbor Commons Ste 104: Notice to Cure, Monetary, AR $21,900',
        '',
        'WAITING ON LEGAL (1)',
        '• Acme LLC, Harbor Commons Ste 104: Notice to Cure, cure date Wed, Oct 14, Monetary, AR $21,900',
        '',
        'BALANCES',
        'Live AR on the 3 open cases in view: $21,900.05.',
        'The data has no AR history, so this is the balance today, not movement since last week.',
        '2 open cases with no balance on file.',
      ].join('\n'),
    );
  });

  it('says "None this week" in a quiet week instead of leaving sections blank', () => {
    const text = renderPlainText(quiet());
    expect(text).toContain('Covers the whole portfolio.');
    expect(text).toContain('STAGE CHANGES (0)\nNone this week');
    expect(text).toContain('NEW THIS WEEK (0)\nNone this week');
    expect(text).toContain('CURED OR CLOSED THIS WEEK (0)\nNone this week');
    expect(text).toContain('OVERDUE (0)\nNone');
    expect(text).toContain('WAITING ON ASSET MANAGEMENT (0)\nNone');
    expect(text).toContain('• 1 open case: 0 with Legal, 0 with asset management');
    expect(text).toContain('Live AR on the 1 open case in view: $0.');
    expect(text).not.toContain('no balance on file');
  });

  it('gives a short note when nothing is in scope', () => {
    const text = renderPlainText(
      quiet({
        counts: { ...quiet().counts, inScope: 0, open: 0 },
        viewer: 'Ann Adams',
        scope: 'own_properties',
      }),
    );
    expect(text).toBe(
      [
        'Subject: Notice Desk weekly summary, week ending Tue, Oct 13',
        '',
        'Notice Desk weekly summary',
        'Week of Wed, Oct 7 to Tue, Oct 13',
        'Covers the properties Ann Adams manages.',
        '',
        'NOTHING TO REPORT',
        'There are no cases on these properties, so there is nothing to summarise.',
      ].join('\n'),
    );
  });

  it('has no markdown artefacts', () => {
    for (const s of [busy(), quiet()]) {
      const text = renderPlainText(s);
      expect(text).not.toMatch(/\*\*|#|`|\|/);
      expect(text).not.toMatch(/^\s*[-*]\s/m);
      expect(text).not.toContain('—');
    }
  });
});

describe('renderHtml', () => {
  it('renders headings, lists and the same lines as the plain text', () => {
    const html = renderHtml(busy());
    expect(html).toContain('<h2');
    expect(html).toContain('>Overdue (1)</h2>');
    expect(html).toContain(
      '<li>Wed, Oct 14: Acme LLC, Harbor Commons Ste 104, Monetary, AR $21,900, with Legal</li>',
    );
    expect(html).toContain('>Ann Adams: 2 cases (1 overdue)</p>');
    expect(renderHtml(quiet())).toContain('>None this week</p>');
  });

  it('escapes anything that could be read as markup', () => {
    const html = renderHtml(
      quiet({
        overdue: [
          sc({
            tenant: 'A & B <script>"x"</script>',
            deadline: '2026-10-06',
            daysUntilDeadline: -1,
          }),
        ],
      }),
    );
    expect(html).toContain('A &amp; B &lt;script&gt;&quot;x&quot;&lt;/script&gt;');
    expect(html).not.toContain('<script>');
  });
});

describe('an accepted narrative paragraph', () => {
  it('goes first in both renderings, as one escaped plain paragraph', () => {
    const paragraph = '  Two cases are overdue & one is\n due <soon>.  ';
    const text = renderPlainText(quiet(), paragraph);
    expect(text).toContain(
      'Covers the whole portfolio.\n\nWHAT CHANGED THIS WEEK\nTwo cases are overdue & one is due <soon>.\n\nAT A GLANCE',
    );
    const html = renderHtml(quiet(), paragraph);
    expect(html).toContain('>What changed this week</h2>');
    expect(html).toContain('Two cases are overdue &amp; one is due &lt;soon&gt;.</p>');
    expect(html.indexOf('What changed this week')).toBeLessThan(html.indexOf('At a glance'));
  });

  it('adds nothing when there is no paragraph or it is blank', () => {
    for (const none of [undefined, '', '   \n ']) {
      expect(renderPlainText(quiet(), none)).toBe(renderPlainText(quiet()));
      expect(renderHtml(quiet(), none)).toBe(renderHtml(quiet()));
    }
  });
});

describe('the real seed', () => {
  it('names no guarantor and carries no note text, in either rendering', async () => {
    const seed = await readSeedDir(path.join(process.cwd(), 'data', 'seed'));
    const persona = buildPersonas(seed).find((p) => p.id === 'maya')!;
    const summary = buildWeekSummary({
      persona,
      asOf: '2026-10-13',
      cases: seed.cases,
      events: seed.events,
      refs: buildLookups(seed),
      actorNames: {},
    });
    const outputs = [renderPlainText(summary), renderHtml(summary), JSON.stringify(summary)];
    // A guarantor who shares a name with an asset manager is legitimately named as the manager.
    const staff = new Set(seed.people.map((p) => p.name));
    const guarantors = seed.cases.flatMap((c) =>
      c.guarantorName && !staff.has(c.guarantorName) ? [c.guarantorName] : [],
    );
    const notes = seed.events.flatMap((e) => (e.note ? [e.note] : []));
    expect(guarantors.length).toBeGreaterThan(0);
    expect(notes.length).toBeGreaterThan(0);
    for (const out of outputs) {
      for (const name of guarantors) expect(out).not.toContain(name);
      for (const note of notes) expect(out).not.toContain(note);
    }

    const text = renderPlainText(summary);
    expect(text).not.toMatch(/\*\*|#|`|\|/);
    expect(text).not.toMatch(/^\s*[-*]\s/m);
    expect(text).toContain('• 30 open cases: 21 with Legal, 9 with asset management');
    expect(text).toContain('• 8 overdue, 4 due in the next 7 days');
    expect(text).toContain('• 1 new case and 0 stage changes this week');
    expect(text).toContain('STAGE CHANGES (0)\nNone this week');
    expect(text).toContain('Live AR on the 30 open cases in view: $599,535.09.');
  });
});
