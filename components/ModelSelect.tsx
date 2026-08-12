'use client';

/**
 * Model picker dropdown, ported from werewolf's AIModelSelect and restyled with the
 * poker theme tokens. Two modes: 'multi' (rival models — checkboxes, filter chips,
 * select-visible/clear) and 'single' (game master — pick one and close).
 * Tier rules never live here: callers pass display-ready ModelPickerOption[] from
 * lib/model-access.ts.
 *
 * Styling note: chips/rows are styled with utilities only — global component classes
 * like .pill carry unlayered min-height/padding that Tailwind utilities cannot override.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ModelTag } from '@/config/models';
import { getModelConfig, modelIsFast, PROVIDER_NAMES, SUPPORTED_MODELS } from '@/config/models';
import type { ModelPickerOption } from '@/lib/model-access';

interface ModelSelectProps {
  options: ModelPickerOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
  mode?: 'multi' | 'single';
  placeholder?: string;
  className?: string;
}

const TAG_COLORS: Record<ModelTag, string> = {
  'very-fast': 'var(--t-acc)',
  fast: 'var(--t-acc)',
  cheap: 'var(--t-acc)',
  slow: 'var(--t-dim)',
  expensive: 'var(--t-dim)',
  'very-slow': 'var(--t-red)',
  'extremely-slow': 'var(--t-red)',
};

const TAG_LABELS: Record<ModelTag, string> = {
  'very-fast': 'very fast',
  fast: 'fast',
  cheap: 'cheap',
  slow: 'slow',
  expensive: 'expensive',
  'very-slow': 'very slow',
  'extremely-slow': 'extremely slow',
};

function chipClass(active: boolean): string {
  return `inline-flex items-center rounded-full border px-2.5 py-[3px] text-[11px] leading-[1.4] transition ${
    active
      ? 'border-gold bg-gold text-[color:var(--t-acc-ink)]'
      : 'border-line bg-transparent text-sage hover:border-gold hover:text-cream'
  }`;
}

function providerOf(id: string): string {
  try {
    return PROVIDER_NAMES[getModelConfig(id).apiKeyName];
  } catch {
    return 'Other';
  }
}

function modelOf(id: string) {
  return SUPPORTED_MODELS.find((m) => m.id === id);
}

export default function ModelSelect({
  options,
  selected,
  onChange,
  mode = 'multi',
  placeholder = 'Select models…',
  className = '',
}: ModelSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [fastOnly, setFastOnly] = useState(false);
  const [activeProviders, setActiveProviders] = useState<Set<string>>(new Set());
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  useEffect(() => {
    if (isOpen) searchRef.current?.focus();
  }, [isOpen]);

  // Group in catalog order, by first appearance of each provider.
  const groups = useMemo(() => {
    const byProvider = new Map<string, ModelPickerOption[]>();
    for (const opt of options) {
      const provider = providerOf(opt.id);
      if (!byProvider.has(provider)) byProvider.set(provider, []);
      byProvider.get(provider)!.push(opt);
    }
    return [...byProvider.entries()];
  }, [options]);

  // Search narrows what's shown; filter chips only drive selection (like werewolf).
  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    return groups
      .map(([provider, opts]) => {
        const matches = opts.filter((o) => {
          const name = modelOf(o.id)?.displayName ?? o.id;
          return (
            !q ||
            name.toLowerCase().includes(q) ||
            provider.toLowerCase().includes(q) ||
            o.id.toLowerCase().includes(q)
          );
        });
        return [provider, matches] as const;
      })
      .filter(([, opts]) => opts.length > 0);
  }, [groups, search]);

  const visibleCount = filteredGroups.reduce((sum, [, opts]) => sum + opts.length, 0);

  // Recompute selection from the active filter set.
  // - No active filters → empty selection.
  // - Otherwise → union of the chips (e.g. fast ∪ MiniMax): each chip adds its
  //   subset, so a provider with no fast models still contributes its models.
  const applyFilters = (nextFast: boolean, nextProviders: Set<string>) => {
    if (!nextFast && nextProviders.size === 0) {
      onChange([]);
      return;
    }
    onChange(
      options
        .filter((o) => {
          if (o.disabled) return false;
          return (nextFast && modelIsFast(o.id)) || nextProviders.has(providerOf(o.id));
        })
        .map((o) => o.id),
    );
  };

  const toggleProvider = (provider: string) => {
    const next = new Set(activeProviders);
    if (next.has(provider)) next.delete(provider);
    else next.add(provider);
    setActiveProviders(next);
    applyFilters(fastOnly, next);
  };

  const toggleFastOnly = () => {
    const next = !fastOnly;
    setFastOnly(next);
    applyFilters(next, activeProviders);
  };

  const toggle = (opt: ModelPickerOption) => {
    if (mode === 'single') {
      if (opt.disabled) return;
      onChange([opt.id]);
      setIsOpen(false);
      return;
    }
    if (selected.includes(opt.id)) onChange(selected.filter((id) => id !== opt.id));
    else if (!opt.disabled) onChange([...selected, opt.id]);
  };

  const selectVisible = () => {
    const visible = filteredGroups
      .flatMap(([, opts]) => opts)
      .filter((o) => !o.disabled)
      .map((o) => o.id);
    onChange([...new Set([...selected, ...visible])]);
  };

  const clear = () => {
    onChange([]);
    setFastOnly(false);
    setActiveProviders(new Set());
  };

  const displayName = (id: string) => modelOf(id)?.displayName ?? id;
  const summary =
    selected.length === 0
      ? placeholder
      : selected.length <= 3
        ? selected.map(displayName).join(', ')
        : `${selected.length} models selected`;

  return (
    <div className={`relative ${className}`} ref={panelRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex w-full items-center gap-2.5 r-sm border bg-transparent px-3.5 py-2.5 text-left transition ${
          isOpen ? 'border-gold' : 'border-line hover:border-gold'
        }`}
      >
        {mode === 'multi' && (
          <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full border border-line bg-panel text-[11px] tabular-nums text-sage">
            {selected.length}
          </span>
        )}
        <span className={`min-w-0 flex-1 truncate text-[14px] ${selected.length === 0 ? 'text-sage' : 'text-cream'}`}>
          {summary}
        </span>
        {fastOnly && (
          <span className="flex-none rounded-full bg-gold px-2 py-[2px] text-[10px] uppercase tracking-[0.1em] text-[color:var(--t-acc-ink)]">
            Fast
          </span>
        )}
        <svg
          className={`flex-none text-sage transition-transform ${isOpen ? 'rotate-180' : ''}`}
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        >
          <path d="M3.5 5.25L7 8.75L10.5 5.25" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute inset-x-0 top-full z-30 mt-1.5 flex flex-col overflow-hidden r-md border border-line bg-panel shadow-theme">
          <div className="border-b border-line-soft p-2">
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search models or providers…"
              className="w-full r-sm border border-line bg-transparent px-3 py-1.5 text-[13px] text-cream outline-none placeholder:text-sage focus:border-gold"
            />
          </div>

          {mode === 'multi' && (
            <div className="flex flex-col gap-1.5 border-b border-line-soft px-2.5 py-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <button type="button" onClick={toggleFastOnly} className={chipClass(fastOnly)}>
                  Fast only
                </button>
                {groups.map(([provider]) => (
                  <button
                    key={provider}
                    type="button"
                    onClick={() => toggleProvider(provider)}
                    className={chipClass(activeProviders.has(provider))}
                  >
                    {provider}
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-end gap-3">
                <button type="button" onClick={selectVisible} className="text-[11px] text-sage hover:text-cream">
                  Select visible
                </button>
                <button type="button" onClick={clear} className="text-[11px] text-sage hover:text-cream">
                  Clear
                </button>
              </div>
            </div>
          )}

          <div className="max-h-[300px] overflow-y-auto py-1">
            {filteredGroups.map(([provider, opts]) => (
              <div key={provider}>
                <div className="px-3.5 pb-1 pt-2 text-[10px] uppercase tracking-[0.14em] text-sage-dim">
                  {provider}
                </div>
                {opts.map((opt) => {
                  const checked = selected.includes(opt.id);
                  const isDisabled = opt.disabled && !checked;
                  const config = modelOf(opt.id);
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => toggle(opt)}
                      disabled={isDisabled}
                      className={`flex w-full items-start gap-2.5 px-3.5 py-1.5 text-left transition ${
                        isDisabled ? 'cursor-not-allowed opacity-40' : 'hover:bg-[color:var(--t-bubble)]'
                      }`}
                    >
                      <span
                        className={`mt-[3px] flex h-4 w-4 flex-none items-center justify-center border transition ${
                          mode === 'single' ? 'rounded-full' : 'rounded-[4px]'
                        } ${checked ? 'border-gold bg-gold' : 'border-line bg-transparent'}`}
                      >
                        {checked &&
                          (mode === 'single' ? (
                            <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--t-acc-ink)]" />
                          ) : (
                            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="var(--t-acc-ink)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M2 5.5L4 7.5L8 3" />
                            </svg>
                          ))}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span className={`text-[13px] ${checked ? 'text-cream' : 'text-body'}`}>
                            {displayName(opt.id)}
                          </span>
                          {(config?.tags ?? []).map((tag) => (
                            <span
                              key={tag}
                              className="rounded-[4px] border px-1.5 text-[10px] leading-[1.6]"
                              style={{ color: TAG_COLORS[tag], borderColor: 'var(--t-line)' }}
                            >
                              {TAG_LABELS[tag]}
                            </span>
                          ))}
                        </span>
                        <span className="block truncate text-[11px] text-sage-dim">
                          {config?.modelApiName}
                          {opt.suffix && <span className="ml-1.5">{opt.suffix}</span>}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
            {visibleCount === 0 && (
              <p className="px-3.5 py-3 text-[13px] text-sage">No models match.</p>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-line-soft px-3.5 py-2 text-[11px] text-sage">
            <span className="tabular-nums">
              {selected.length} selected · {visibleCount} shown
            </span>
            <button type="button" onClick={() => setIsOpen(false)} className="text-body hover:text-cream">
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
