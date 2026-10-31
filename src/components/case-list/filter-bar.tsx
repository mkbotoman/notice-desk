import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { STAGES, TEAMS, type Stage, type Team } from '@/domain/types';
import { STAGE_LABELS, TEAM_LABELS } from '@/lib/format';
import { EMPTY_FILTERS, hasActiveFilters, type CaseFilters } from './filters';

export interface PropertyOption {
  id: string;
  name: string;
}

const CONTROL =
  'h-10 rounded-lg border border-input bg-card px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

function propertySummary(selected: string[], options: readonly PropertyOption[]): string {
  if (selected.length === 0) return 'All properties';
  if (selected.length === 1) {
    return options.find((o) => o.id === selected[0])?.name ?? '1 property';
  }
  return `${selected.length} properties`;
}

export function FilterBar({
  filters,
  onChange,
  properties,
  showClosedStages,
}: {
  filters: CaseFilters;
  onChange: (next: CaseFilters) => void;
  properties: readonly PropertyOption[];
  showClosedStages: boolean;
}) {
  const set = (patch: Partial<CaseFilters>) => onChange({ ...filters, ...patch });
  const stages = STAGES.filter((s) => showClosedStages || (s !== 'cured' && s !== 'closed'));
  const toggleProperty = (id: string) =>
    set({
      property: filters.property.includes(id)
        ? filters.property.filter((p) => p !== id)
        : [...filters.property, id],
    });

  return (
    <div
      role="search"
      className="flex flex-wrap items-center gap-2.5 rounded-xl border bg-card p-3"
    >
      <Input
        type="search"
        aria-label="Search tenant or property"
        placeholder="Search tenant or property"
        value={filters.q}
        onChange={(e) => set({ q: e.target.value })}
        className="h-10 flex-[1_1_240px] bg-card text-sm"
      />
      <select
        aria-label="Stage"
        className={CONTROL}
        value={filters.stage ?? ''}
        onChange={(e) => set({ stage: (e.target.value || null) as Stage | null })}
      >
        <option value="">All stages</option>
        {stages.map((s) => (
          <option key={s} value={s}>
            {STAGE_LABELS[s]}
          </option>
        ))}
      </select>
      <select
        aria-label="Waiting on"
        className={CONTROL}
        value={filters.owner ?? ''}
        onChange={(e) => set({ owner: (e.target.value || null) as Team | null })}
      >
        <option value="">Waiting on anyone</option>
        {TEAMS.map((t) => (
          <option key={t} value={t}>
            {TEAM_LABELS[t]}
          </option>
        ))}
      </select>
      <details className="relative">
        <summary
          aria-label={`Property: ${propertySummary(filters.property, properties)}`}
          className={`${CONTROL} flex cursor-pointer list-none items-center gap-2 select-none`}
        >
          {propertySummary(filters.property, properties)}
          <span aria-hidden className="text-xs text-muted-foreground">
            ▾
          </span>
        </summary>
        <fieldset className="absolute left-0 z-10 mt-1 flex max-h-72 min-w-56 flex-col gap-1 overflow-y-auto rounded-lg border bg-card p-2 shadow-md">
          <legend className="sr-only">Properties</legend>
          {properties.map((p) => (
            <label
              key={p.id}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
            >
              <input
                type="checkbox"
                className="size-4"
                checked={filters.property.includes(p.id)}
                onChange={() => toggleProperty(p.id)}
              />
              {p.name}
            </label>
          ))}
        </fieldset>
      </details>
      <label className="flex items-center gap-2 px-1.5 text-sm text-gray-700">
        <input
          type="checkbox"
          className="size-4"
          checked={filters.closed}
          onChange={(e) =>
            set({
              closed: e.target.checked,
              stage:
                e.target.checked || (filters.stage !== 'cured' && filters.stage !== 'closed')
                  ? filters.stage
                  : null,
            })
          }
        />
        Include closed
      </label>
      {hasActiveFilters(filters) ? (
        <Button variant="ghost" onClick={() => onChange(EMPTY_FILTERS)} className="h-10">
          Clear filters
        </Button>
      ) : null}
    </div>
  );
}
