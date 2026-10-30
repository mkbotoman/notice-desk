import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Seed } from '@/domain/schemas';
import type { Case, CaseEvent, CoiRecord, Persona, Property } from '@/domain/types';
import { buildPersonas } from '@/lib/persona/personas';
import { readSeedDir } from '@/lib/seed';
import { makeCase, makeEvent } from '@/test/factories';
import { businessDaysUntil, isBusinessDay } from './business-days';
import {
  buildManualNotification,
  countByStatus,
  defaultRecipient,
  defaultTemplate,
  dismissDraft,
  editDraft,
  filterNotifications,
  recipientKey,
  renderForCase,
  sendDraft,
} from './compose';
import {
  propertyContactRecipient,
  propertyPeople,
  greetingName,
  personaRecipient,
} from './recipients';
import {
  TEMPLATES,
  TEMPLATE_IDS,
  buildMergeFields,
  renderTemplate,
  type FieldSources,
} from './templates';
import { evaluateTriggers, type NotificationRefs, type TriggerInput } from './triggers';

let seed: Seed;
let personas: Persona[];
let refs: NotificationRefs;
const NOW = '2026-10-14T09:00:00.000Z';

beforeAll(async () => {
  seed = await readSeedDir(path.join(process.cwd(), 'data', 'seed', 'fixture'));
  personas = buildPersonas(seed);
  refs = {
    propertyById: new Map(seed.properties.map((p) => [p.id, p])),
    leaseById: new Map(seed.leases.map((l) => [l.id, l])),
    tenantById: new Map(seed.tenants.map((t) => [t.id, t])),
    coi: seed.coi,
  };
});

const eventsOf = (events: CaseEvent[]) => {
  const map = new Map<string, CaseEvent[]>();
  for (const e of events) map.set(e.caseId, [...(map.get(e.caseId) ?? []), e]);
  return map;
};

const input = (over: Partial<TriggerInput> = {}): TriggerInput => ({
  asOf: '2026-10-14',
  now: NOW,
  cases: seed.cases,
  eventsByCase: eventsOf(seed.events),
  existing: [],
  refs,
  personas,
  ...over,
});

describe('business days', () => {
  it('skips weekends and holidays', () => {
    expect(isBusinessDay('2026-10-12')).toBe(false); // Columbus Day
    expect(isBusinessDay('2026-10-10')).toBe(false); // Saturday
    expect(isBusinessDay('2026-10-13')).toBe(true);
  });

  it('counts after the start date, up to and including the end date', () => {
    expect(businessDaysUntil('2026-10-14', '2026-10-19')).toBe(3);
    expect(businessDaysUntil('2026-10-09', '2026-10-13')).toBe(1); // Mon is a holiday
    expect(businessDaysUntil('2026-10-14', '2026-10-14')).toBe(0);
    expect(businessDaysUntil('2026-10-14', '2026-10-01')).toBe(0);
  });

  it('only skips weekends before the holiday calendar begins', () => {
    expect(isBusinessDay('2020-07-03')).toBe(true);
    expect(isBusinessDay('2020-07-04')).toBe(false);
  });
});

describe('recipients', () => {
  const property = (over: Partial<Property> = {}) => ({ ...seed.properties[0], ...over });

  it("finds the property's property manager, falling back to the asset manager", () => {
    expect(propertyContactRecipient(property(), personas).personaId).toBe('pm-priya-shah');
    expect(
      propertyContactRecipient(property({ propertyManagerId: null }), personas).personaId,
    ).toBe('am-lena-park');
  });

  it('is never Legal or the viewer, and explains when nobody is assigned', () => {
    expect(propertyContactRecipient(undefined, personas)).toEqual({
      personaId: null,
      label: 'Property manager (property unknown)',
    });
    const none = propertyContactRecipient(
      property({ propertyManagerId: null, assetManagerId: null }),
      personas,
    );
    expect(none.personaId).toBeNull();
    expect(none.label).toContain('none assigned');
  });

  it('lists the people at a property for the recipient picker', () => {
    expect(propertyPeople(property(), personas).map((p) => p.id)).toEqual([
      'pm-priya-shah',
      'am-lena-park',
    ]);
    expect(propertyPeople(property({ assetManagerId: null }), personas).map((p) => p.id)).toEqual([
      'pm-priya-shah',
    ]);
    expect(propertyPeople(undefined, personas)).toEqual([]);
  });

  it('greets by first name, or not at all', () => {
    expect(greetingName('am-lena-park', personas)).toBe('Lena');
    expect(greetingName(null, personas)).toBeNull();
    expect(personaRecipient(personas[0]).personaId).toBe('maya');
  });
});

describe('triggers against the fixture at its data date', () => {
  it('fires deadline passed, deadline approaching and COI once each', () => {
    const drafts = evaluateTriggers(input());
    expect(drafts.map((d) => [d.trigger, d.caseId, d.recipientPersonaId])).toEqual([
      ['deadline_passed', 'N-001', 'pm-priya-shah'],
      ['deadline_approaching', 'N-004', 'pm-dan-whitfield'],
      ['coi_expiring', 'N-002', 'pm-dan-whitfield'],
    ]);
    for (const d of drafts) {
      expect(d.status).toBe('draft');
      expect(d.source).toBe('template');
      expect(d.createdAt).toBe(NOW);
      expect(d.id).toBe(`NF-${d.dedupeKey}`);
    }
    expect(drafts[0].dedupeKey).toBe('N-001:deadline_passed:2026-10-13');
    expect(drafts[1].dedupeKey).toBe('N-004:deadline_approaching:2026-10-19');
    expect(drafts[2].dedupeKey).toBe('coi:T-01:P-03:expired:2026-09-30');
  });

  it('does not duplicate on a second run, whatever the status of the first', () => {
    const first = evaluateTriggers(input());
    expect(evaluateTriggers(input({ existing: first }))).toEqual([]);
    const dismissed = first.map((n) => ({ ...n, status: 'dismissed' as const }));
    expect(evaluateTriggers(input({ existing: dismissed }))).toEqual([]);
  });

  it('does not repeat a key within one run', () => {
    const twin = makeCase({ id: 'N-004' });
    const cases = [twin, twin];
    const drafts = evaluateTriggers(input({ cases, asOf: '2026-10-14', eventsByCase: new Map() }));
    expect(drafts.filter((d) => d.caseId === 'N-004')).toHaveLength(1);
  });

  it('does not fire for deadlines far away, absent, or outside Notice to Cure', () => {
    const cases = [
      makeCase({ id: 'far', leaseId: null, propertyId: null }), // 10 business days from 09-28: past
      makeCase({
        id: 'later',
        dateSent: '2026-10-13',
        curePeriod: { kind: 'days', n: 30, unit: 'calendar' },
      }),
      makeCase({ id: 'none', curePeriod: { kind: 'none' } }),
      makeCase({ id: 'default', stage: 'default' }),
    ];
    const drafts = evaluateTriggers(
      input({ cases, eventsByCase: new Map(), refs: { ...refs, coi: [] } }),
    );
    expect(drafts.map((d) => d.caseId)).toEqual(['far']);
    expect(drafts[0].trigger).toBe('deadline_passed');
    expect(drafts[0].body).toContain('Unknown tenant');
  });

  it('counts the deadline day itself as approaching, and uses the business-day window', () => {
    const cal = (n: number) => ({ kind: 'days', n, unit: 'calendar' }) as const;
    const cases = [
      makeCase({ id: 'today', dateSent: '2026-10-09', curePeriod: cal(5) }), // due 10-14
      makeCase({ id: 'edge', dateSent: '2026-10-09', curePeriod: cal(10) }), // 10-19: 3 days
      makeCase({ id: 'over', dateSent: '2026-10-09', curePeriod: cal(11) }), // 10-20: 4 days
    ];
    const drafts = evaluateTriggers(
      input({ cases, eventsByCase: new Map(), refs: { ...refs, coi: [] } }),
    );
    expect(drafts.map((d) => d.caseId)).toEqual(['today', 'edge']);
  });

  it('skips a holiday when counting', () => {
    // Fri 10-09 to Tue 10-13 is 1 business day because Mon 10-12 is Columbus Day.
    const cases = [
      makeCase({
        id: 'h',
        dateSent: '2026-10-03',
        curePeriod: { kind: 'days', n: 10, unit: 'calendar' },
      }),
    ];
    const drafts = evaluateTriggers(
      input({ cases, asOf: '2026-10-09', eventsByCase: new Map(), refs: { ...refs, coi: [] } }),
    );
    expect(drafts.map((d) => d.trigger)).toEqual(['deadline_approaching']); // due 10-13
  });

  it('drafts stage and owner changes the app recorded, once per event', () => {
    const events = [
      ...seed.events,
      makeEvent({
        id: 'EV-stage',
        caseId: 'N-004',
        type: 'stage_changed',
        payload: { from: 'notice_to_cure', to: 'default' },
      }),
      makeEvent({
        id: 'EV-owner',
        caseId: 'N-001',
        type: 'owner_changed',
        payload: { from: 'legal', to: 'asset_management' },
      }),
      makeEvent({
        id: 'EV-owner-legal',
        caseId: 'N-004',
        type: 'owner_changed',
        payload: { from: 'asset_management', to: 'legal' },
      }),
      makeEvent({
        id: 'EV-import',
        caseId: 'N-001',
        actorPersonaId: 'import',
        type: 'stage_changed',
        payload: { from: 'non_compliant', to: 'notice_to_cure' },
      }),
      makeEvent({ id: 'EV-note', caseId: 'N-001' }),
    ];
    const run = input({ eventsByCase: eventsOf(events) });
    const drafts = evaluateTriggers(run);
    const byKey = new Map(drafts.map((d) => [d.dedupeKey, d]));

    const stage = byKey.get('EV-stage')!;
    expect(stage.trigger).toBe('stage_changed');
    expect(stage.recipientPersonaId).toBe('pm-dan-whitfield');
    expect(stage.body).toContain('moved from Notice to Cure to Default');

    expect(byKey.get('EV-owner')!.recipientPersonaId).toBe('pm-priya-shah');
    expect(byKey.get('EV-owner')!.body).toContain('now with Asset Management');
    // Handing a case back to Legal still tells the property's own manager, not Legal.
    expect(byKey.get('EV-owner-legal')!.recipientPersonaId).toBe('pm-dan-whitfield');
    expect(byKey.has('EV-import')).toBe(false);
    expect(byKey.has('EV-note')).toBe(false);
    expect(evaluateTriggers({ ...run, existing: drafts })).toEqual([]);
  });

  it('follows the as-of date for COI and ignores non-expiring statuses', () => {
    const expiring = (over: Partial<CoiRecord>): CoiRecord => ({
      tenantId: 'T-9',
      propertyId: 'P-02',
      leaseIds: ['L-9'],
      status: 'valid',
      expiresOn: '2026-10-30',
      ...over,
    });
    const cases = [
      makeCase({
        id: 'A',
        propertyId: 'P-02',
        leaseId: 'L-9',
        stage: 'closed',
        dateSent: null,
        curePeriod: { kind: 'none' },
      }),
      makeCase({
        id: 'B',
        propertyId: 'P-02',
        leaseId: 'L-9',
        stage: 'default',
        dateSent: null,
        curePeriod: { kind: 'none' },
      }),
      makeCase({
        id: 'C',
        propertyId: 'P-02',
        leaseId: 'L-8',
        stage: 'closed',
        dateSent: null,
        curePeriod: { kind: 'none' },
      }),
      makeCase({
        id: 'D',
        leaseId: null,
        propertyId: null,
        stage: 'closed',
        dateSent: null,
        curePeriod: { kind: 'none' },
      }),
    ];
    const run = (coi: CoiRecord[], asOf = '2026-10-14') =>
      evaluateTriggers(input({ cases, asOf, eventsByCase: new Map(), refs: { ...refs, coi } }));

    const [one] = run([expiring({})]);
    expect(one.caseId).toBe('B'); // the open case wins over the closed one
    expect(one.dedupeKey).toBe('coi:T-9:P-02:expiring:2026-10-30');
    expect(one.recipientPersonaId).toBe('pm-dan-whitfield');
    expect(one.body).toContain('expiring');

    expect(run([expiring({})], '2026-12-01')[0].dedupeKey).toBe('coi:T-9:P-02:expired:2026-10-30');
    expect(run([expiring({ expiresOn: '2027-06-01' })])).toEqual([]);
    expect(run([expiring({ status: 'missing', expiresOn: null })])).toEqual([]);
    expect(run([expiring({ status: 'non_compliant' })])).toEqual([]);
    expect(run([expiring({ leaseIds: ['L-nope'] })])).toEqual([]);

    const noExpiry = run([expiring({ status: 'expiring', expiresOn: null, propertyId: null })]);
    expect(noExpiry[0].dedupeKey).toBe('coi:T-9:none:expiring:unknown');
    expect(noExpiry[0].body).toContain('expiry unknown');

    // Only closed cases: falls back to the first by id.
    const closedOnly = evaluateTriggers(
      input({
        cases: [cases[2], cases[0]].map((c) => ({ ...c, leaseId: 'L-9' })),
        eventsByCase: new Map(),
        refs: { ...refs, coi: [expiring({})] },
      }),
    );
    expect(closedOnly[0].caseId).toBe('A');
  });

  it('drafts a COI notice for a case whose lease has no property', () => {
    const cases = [makeCase({ id: 'np', leaseId: 'L-9', propertyId: null, stage: 'closed' })];
    const coi: CoiRecord = {
      tenantId: 'T-9',
      propertyId: null,
      leaseIds: ['L-9'],
      status: 'expired',
      expiresOn: '2026-09-01',
    };
    const [draft] = evaluateTriggers(
      input({ cases, eventsByCase: new Map(), refs: { ...refs, coi: [coi] } }),
    );
    expect(draft.trigger).toBe('coi_expiring');
    expect(draft.recipientPersonaId).toBeNull();
  });

  it('leaves the recipient unresolved when the property is unknown', () => {
    const cases = [
      makeCase({
        id: 'x',
        owner: 'asset_management',
        propertyId: null,
        dateSent: '2026-10-09',
        curePeriod: { kind: 'days', n: 10, unit: 'calendar' },
      }),
    ];
    const [draft] = evaluateTriggers(
      input({ cases, eventsByCase: new Map(), refs: { ...refs, coi: [] } }),
    );
    expect(draft.recipientPersonaId).toBeNull();
    expect(draft.recipientLabel).toBe('Property manager (property unknown)');
    expect(draft.body.startsWith('Hi,')).toBe(true);
  });
});

describe('templates', () => {
  const c = makeCase({
    id: 'N-77',
    leaseId: 'L-001',
    tenantId: 'T-01',
    propertyId: 'P-01',
    guarantorName: 'Gary Guarantor',
    hasGuarantor: true,
    workflowStatus: 'Secret internal status',
  });
  const run = () => ({ asOf: '2026-10-14', refs, personas });
  const recipient = { personaId: 'am-lena-park', label: 'Lena Park · Asset manager' };

  it('renders every merge field for every template, deterministically', () => {
    const fields = buildMergeFields(
      c,
      {
        tenant: refs.tenantById.get('T-01'),
        property: refs.propertyById.get('P-01'),
        lease: refs.leaseById.get('L-001'),
        coi: { status: 'non_compliant', expiresOn: '2026-11-05' },
      },
      {
        deadline: '2026-10-19',
        previousStage: 'non_compliant',
        owner: 'asset_management',
        recipientName: 'Lena',
      },
    );
    expect(fields).toMatchObject({
      tenant: 'Brightside Fitness LLC',
      where: 'Harbor Commons, Suite 110',
      amount: '$18,450',
      deadline: 'Mon, Oct 19, 2026',
      deadlineShort: 'Mon, Oct 19',
      caseLink: '/cases/N-77',
      owner: 'Asset Management',
      coiStatus: 'non compliant',
    });
    const text = (id: (typeof TEMPLATE_IDS)[number]) => {
      const r = renderTemplate(id, fields);
      return `${r.subject}\n${r.body}`;
    };
    expect(text('deadline_approaching')).toContain('Mon, Oct 19, 2026');
    expect(text('deadline_passed')).toContain('was Mon, Oct 19, 2026');
    expect(text('stage_changed')).toContain('moved from Non-compliant to Notice to Cure');
    expect(text('owner_changed')).toContain('now with Asset Management');
    expect(text('coi_expiring')).toContain('non compliant (expiry Thu, Nov 5, 2026)');
    for (const id of TEMPLATE_IDS.filter((t) => t !== 'blank')) {
      const out = text(id);
      expect(out).toContain('Brightside Fitness LLC');
      expect(out).toContain('Harbor Commons, Suite 110');
      expect(out).toContain('Hi Lena,');
      expect(out).toContain('/cases/N-77');
      expect(text(id)).toBe(out);
    }
    expect(text('blank')).toBe('\n');
  });

  it('never includes guarantor data or notes, and tolerates missing data', () => {
    for (const id of TEMPLATE_IDS) {
      const { subject, body } = renderForCase(id, c, recipient, run());
      expect(`${subject}${body}`).not.toMatch(/Gary|Guarantor|Secret/);
    }
    const sparse: FieldSources = {
      tenant: undefined,
      property: undefined,
      lease: undefined,
      coi: undefined,
    };
    const f = buildMergeFields(makeCase(), sparse);
    expect(f).toMatchObject({
      tenant: 'Unknown tenant',
      where: 'an unknown property',
      amount: 'not available',
      deadline: null,
      coiStatus: 'not on file',
      coiExpiry: 'unknown',
      previousStage: null,
    });
    const text = TEMPLATES.map((t) => t.render(f).body).join('\n');
    expect(text).toContain('not set');
    expect(text).toContain('is now in Notice to Cure');
    expect(text).toContain('Hi,');
  });

  it('throws for an unknown template', () => {
    expect(() =>
      renderTemplate(
        'nope' as never,
        buildMergeFields(c, {
          tenant: undefined,
          property: undefined,
          lease: undefined,
          coi: undefined,
        }),
      ),
    ).toThrow();
  });

  it('has a template per automatic trigger plus a blank', () => {
    expect(TEMPLATES.map((t) => t.trigger)).toEqual([
      'deadline_approaching',
      'deadline_passed',
      'stage_changed',
      'owner_changed',
      'coi_expiring',
      'manual',
    ]);
  });

  it('fills a case with its own cure deadline and balance', () => {
    const { body } = renderForCase('deadline_approaching', seed.cases[0], recipient, run());
    expect(body).toContain('Tue, Oct 13, 2026');
    expect(body).toContain('$18,450');
  });
});

describe('composing and the outbox lifecycle', () => {
  const rendered = { subject: 'S', body: 'B' };
  const manual = (over = {}) =>
    buildManualNotification({
      id: 'NF-manual-1',
      caseId: 'N-001',
      recipient: { personaId: 'maya', label: 'Maya · Legal' },
      subject: 'S',
      body: 'B',
      template: { rendered },
      status: 'draft',
      now: NOW,
      ...over,
    });

  it('marks an unedited template as template and anything else as manual', () => {
    const n = manual();
    expect(n).toMatchObject({
      trigger: 'manual',
      source: 'template',
      dedupeKey: n.id,
      status: 'draft',
    });
    expect(n.sentAt).toBeUndefined();
    expect(manual({ subject: 'S2' }).source).toBe('manual');
    expect(manual({ body: 'B2' }).source).toBe('manual');
    expect(manual({ template: null }).source).toBe('manual');
  });

  it('stamps sentAt when sent straight from the composer', () => {
    expect(manual({ status: 'sent' })).toMatchObject({ status: 'sent', sentAt: NOW });
  });

  it('rejects empty text', () => {
    expect(() => manual({ subject: '  ' })).toThrow('subject and a message');
    expect(() => manual({ body: '' })).toThrow('subject and a message');
  });

  it('edits, sends and dismisses drafts only', () => {
    const draft = manual();
    const same = editDraft(draft, { subject: 'S', body: 'B' });
    expect(same.source).toBe('template');
    const edited = editDraft(draft, { subject: 'S', body: 'B!' });
    expect(edited).toMatchObject({ body: 'B!', source: 'manual' });
    expect(editDraft({ ...draft, source: 'ai_draft' }, { subject: 'S', body: 'B!' }).source).toBe(
      'ai_draft',
    );
    expect(() => editDraft(draft, { subject: '', body: 'B' })).toThrow();

    const sent = sendDraft(edited, '2026-10-15T10:00:00.000Z');
    expect(sent).toMatchObject({ status: 'sent', sentAt: '2026-10-15T10:00:00.000Z' });
    expect(() => sendDraft({ ...draft, body: '' }, NOW)).toThrow();
    for (const act of [
      () => editDraft(sent, { subject: 'a', body: 'b' }),
      () => sendDraft(sent, NOW),
      () => dismissDraft(sent),
    ]) {
      expect(act).toThrow('Only a draft');
    }
    expect(dismissDraft(draft).status).toBe('dismissed');
  });

  it('filters, sorts newest first, and counts per tab', () => {
    const mk = (
      id: string,
      status: 'draft' | 'sent' | 'dismissed',
      at: string,
      caseId = 'N-001',
      p: string | null = 'maya',
    ) =>
      ({
        ...manual({ id, caseId, createdAt: at, recipient: { personaId: p, label: 'Someone' } }),
        status,
        createdAt: at,
      }) as ReturnType<typeof manual>;
    const list = [
      mk('a', 'draft', '2026-10-14T09:00:00.000Z'),
      mk('b', 'draft', '2026-10-14T10:00:00.000Z', 'N-004', null),
      mk('c', 'draft', '2026-10-14T10:00:00.000Z'),
      mk('d', 'sent', '2026-10-14T11:00:00.000Z'),
      mk('e', 'dismissed', '2026-10-14T12:00:00.000Z'),
    ];
    const all = { caseId: null, recipient: null };
    expect(filterNotifications(list, { ...all, status: 'draft' }).map((n) => n.id)).toEqual([
      'c',
      'b',
      'a',
    ]);
    expect(
      filterNotifications(list, { status: 'draft', caseId: 'N-004', recipient: null }).map(
        (n) => n.id,
      ),
    ).toEqual(['b']);
    expect(
      filterNotifications(list, { status: 'draft', caseId: null, recipient: 'maya' }).map(
        (n) => n.id,
      ),
    ).toEqual(['c', 'a']);
    expect(
      filterNotifications(list, { status: 'draft', caseId: null, recipient: 'Someone' }).map(
        (n) => n.id,
      ),
    ).toEqual(['b']);
    expect(countByStatus(list, all)).toEqual({ draft: 3, sent: 1, dismissed: 1 });
    expect(countByStatus(list, { caseId: 'N-004', recipient: null })).toEqual({
      draft: 1,
      sent: 0,
      dismissed: 0,
    });
    expect(recipientKey(list[1])).toBe('Someone');
  });
});

describe('types', () => {
  it('keeps the Case type free of anything the templates read beyond MergeFields', () => {
    const c: Case = makeCase();
    expect(
      Object.keys(
        buildMergeFields(c, {
          tenant: undefined,
          property: undefined,
          lease: undefined,
          coi: undefined,
        }),
      ).join(),
    ).not.toMatch(/guarantor|note/i);
  });
});

describe('composer defaults', () => {
  const cal = (n: number) => ({ kind: 'days', n, unit: 'calendar' }) as const;
  const asOf = '2026-10-14';

  it('picks the template that fits the case', () => {
    const sent = '2026-10-09';
    expect(defaultTemplate(makeCase({ dateSent: sent, curePeriod: cal(1) }), asOf)).toBe(
      'deadline_passed',
    );
    expect(defaultTemplate(makeCase({ dateSent: sent, curePeriod: cal(7) }), asOf)).toBe(
      'deadline_approaching',
    );
    expect(defaultTemplate(makeCase({ dateSent: sent, curePeriod: cal(30) }), asOf)).toBe(
      'deadline_approaching',
    );
    expect(defaultTemplate(makeCase({ curePeriod: { kind: 'unknown' } }), asOf)).toBe(
      'stage_changed',
    );
    expect(defaultTemplate(makeCase({ stage: 'default' }), asOf)).toBe('stage_changed');
  });

  it("addresses a case to its property's property manager, never to whoever is viewing", () => {
    const input = { refs, personas };
    const held = makeCase({ owner: 'asset_management', propertyId: 'P-02' });
    expect(defaultRecipient(held, input).personaId).toBe('pm-dan-whitfield');
    expect(
      defaultRecipient(makeCase({ owner: 'legal', propertyId: 'P-01' }), input).personaId,
    ).toBe('pm-priya-shah');
    const orphan = makeCase({ owner: 'asset_management', propertyId: null });
    expect(defaultRecipient(orphan, input).personaId).toBeNull();
  });
});
