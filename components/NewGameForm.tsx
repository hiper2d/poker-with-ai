'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createGame, previewGame } from '@/app/actions/game-actions';
import type { ModelAccess } from '@/app/actions/user-actions';
import { getModelAccess } from '@/app/actions/user-actions';
import ExpandableTextarea from '@/components/ExpandableTextarea';
import ModelSelect from '@/components/ModelSelect';
import { Avatar, Button, CapsLabel, Panel, Pill } from '@/components/ui';
import { GAME_CONFIG } from '@/config/game';
import { SUPPORTED_MODELS } from '@/config/models';
import { PERSONAS } from '@/config/personas';
import { deckCapacity, FREE_TIER_UNLIMITED, getModelPickerOptions } from '@/lib/model-access';
import type { CharacterPreview, GamePreview, GamePreviewInput } from '@/models/preview';

const AVATAR_COLORS = ['#5c8f7b', '#8d6a3f', '#a35f6d', '#4f6f8f', '#96608f', '#6f8f4f', '#8f7b4f'];

/** Derived so the picker can never offer a seat count the server would reject. */
const SEAT_OPTIONS = Array.from(
  { length: GAME_CONFIG.maxPlayers - GAME_CONFIG.minPlayers + 1 },
  (_, i) => GAME_CONFIG.minPlayers + i,
);

// Fugu Ultra is opt-in only (expensive) — excluded from the default selection but
// still selectable in the dropdown. Touching a filter chip replaces this default
// with the union of the active chips.
const OPT_IN_ONLY = new Set(['fugu']);
const DEFAULT_BOT_MODELS = SUPPORTED_MODELS.filter((m) => !OPT_IN_ONLY.has(m.id)).map((m) => m.id);

export default function NewGameForm() {
  const router = useRouter();
  const [theme, setTheme] = useState('');
  const [humanPlayerName, setHumanPlayerName] = useState('');
  const [playerCount, setPlayerCount] = useState(4);
  const [botModelIds, setBotModelIds] = useState<string[]>(DEFAULT_BOT_MODELS);
  const [gmModelId, setGmModelId] = useState('claude');
  const [access, setAccess] = useState<ModelAccess | null>(null);
  const [preview, setPreview] = useState<GamePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const input: GamePreviewInput = { theme, humanPlayerName, playerCount, botModelIds, gmModelId };

  // Once the tier loads, drop selections the tier doesn't allow and re-seat the GM.
  useEffect(() => {
    getModelAccess()
      .catch((): ModelAccess => ({ tier: 'free' }))
      .then((loaded) => {
        setAccess(loaded);
        const enabled = new Set(
          getModelPickerOptions(loaded.tier)
            .filter((o) => !o.disabled)
            .map((o) => o.id),
        );
        setBotModelIds((prev) => {
          const kept = prev.filter((id) => enabled.has(id));
          if (kept.length > 0) return kept;
          // Fall back to whatever the tier actually allows. Fugu stays opt-in
          // unless it's the only thing available.
          const fallback = [...enabled].filter((id) => !OPT_IN_ONLY.has(id));
          return fallback.length > 0 ? fallback : [...enabled];
        });
        setGmModelId((prev) => (enabled.has(prev) ? prev : ([...enabled][0] ?? prev)));
      });
  }, []);

  const tier = access?.tier ?? 'free';
  const pickerOptions = useMemo(() => {
    if (!access) return SUPPORTED_MODELS.map((m) => ({ id: m.id, disabled: false }));
    return getModelPickerOptions(access.tier);
  }, [access]);

  const botCount = playerCount - 1;
  const capacity = deckCapacity(botModelIds, tier, gmModelId);
  const capacityError =
    botModelIds.length > 0 && capacity < botCount
      ? `Selected models can cover only ${capacity === FREE_TIER_UNLIMITED ? botCount : capacity} of ${botCount} bots on the free tier — per-model caps apply. Add more models.`
      : null;

  const onPreview = () =>
    startTransition(async () => {
      setError(null);
      try {
        setPreview(await previewGame(input));
      } catch (e) {
        setError(String(e instanceof Error ? e.message : e));
      }
    });

  const onCreate = () =>
    startTransition(async () => {
      if (!preview) return;
      setError(null);
      try {
        const id = await createGame(input, preview);
        router.push(`/games/${id}`);
      } catch (e) {
        setError(String(e instanceof Error ? e.message : e));
      }
    });

  // Everything in the generated preview is editable before the table opens (like werewolf):
  // the scene, and each character's name, story, persona, and model.
  const updateScene = (scene: string) => setPreview((prev) => prev && { ...prev, scene });
  const updateCharacter = (index: number, patch: Partial<CharacterPreview>) =>
    setPreview(
      (prev) =>
        prev && {
          ...prev,
          characters: prev.characters.map((c, i) => (i === index ? { ...c, ...patch } : c)),
        },
    );

  const nameError = (() => {
    if (!preview) return null;
    const names = preview.characters.map((c) => c.name.trim());
    if (names.some((n) => !n)) return 'Every character needs a name.';
    const all = [...names, humanPlayerName.trim()].filter(Boolean);
    const seen = new Set<string>();
    const dupes = new Set<string>();
    for (const n of all) {
      const key = n.toLowerCase();
      if (seen.has(key)) dupes.add(n);
      seen.add(key);
    }
    if (dupes.size > 0) {
      return `Character names must be unique (including yours) — duplicated: ${[...dupes].join(', ')}.`;
    }
    return null;
  })();

  return (
    <div className="flex flex-col gap-4">
      <Panel className="p-5">
        <CapsLabel className="mb-3">Theme</CapsLabel>
        <input
          value={theme}
          onChange={(e) => setTheme(e.target.value)}
          placeholder="Dune, Cyberpunk Night City, 1920s Chicago…"
          className="w-full r-sm border border-line bg-transparent px-4 py-3 font-serif text-xl text-cream outline-none placeholder:text-sage focus:border-gold"
        />
      </Panel>

      <Panel className="grid gap-4 p-5 md:grid-cols-2">
        <div>
          <CapsLabel className="mb-3">Your character name</CapsLabel>
          <input
            value={humanPlayerName}
            onChange={(e) => setHumanPlayerName(e.target.value)}
            placeholder="Paul"
            className="w-full r-sm border border-line bg-transparent px-4 py-2.5 text-[15px] text-cream outline-none placeholder:text-sage focus:border-gold"
          />
        </div>
        <div>
          <CapsLabel className="mb-3">Seats</CapsLabel>
          <div className="flex flex-wrap gap-2">
            {SEAT_OPTIONS.map((n) => (
              <Pill key={n} selected={playerCount === n} onClick={() => setPlayerCount(n)}>
                {n}
              </Pill>
            ))}
          </div>
        </div>
      </Panel>

      <Panel className="p-5">
        <div className="mb-3.5 flex items-baseline justify-between gap-3">
          <CapsLabel>Rival models</CapsLabel>
          <div className="text-xs text-sage-dim">
            {tier === 'free'
              ? 'free tier — per-model bot caps apply'
              : 'dealt randomly to characters'}
          </div>
        </div>
        <ModelSelect
          options={pickerOptions}
          selected={botModelIds}
          onChange={setBotModelIds}
          placeholder="Select rival models…"
        />
        {capacityError && <p className="mt-2.5 text-xs text-loss">{capacityError}</p>}
        <div className="mt-5 border-t border-line-soft pt-4">
          <CapsLabel className="mb-3">Game master</CapsLabel>
          <ModelSelect
            options={pickerOptions}
            selected={gmModelId ? [gmModelId] : []}
            onChange={(ids) => setGmModelId(ids[0] ?? '')}
            mode="single"
            placeholder="Pick the game master model…"
          />
        </div>
      </Panel>

      <div className="flex flex-wrap gap-3">
        <Button
          variant="moss"
          size="lg"
          onClick={onPreview}
          disabled={isPending || !!capacityError || botModelIds.length === 0}
          className="flex-[0_1_220px]"
        >
          {isPending && !preview ? 'Dealing characters…' : preview ? 'Re-deal characters' : 'Deal the characters'}
        </Button>
        {preview && (
          <Button
            variant="gold"
            size="lg"
            onClick={onCreate}
            disabled={isPending || !!nameError}
            className="flex-1"
          >
            {isPending ? 'Opening…' : 'Open the table'}
          </Button>
        )}
      </div>

      {error && (
        <p className="r-md border border-loss bg-panel px-4 py-3 text-sm text-loss">{error}</p>
      )}

      {preview && (
        <div className="flex flex-col gap-4">
          <Panel variant="glow" className="p-5">
            <CapsLabel className="mb-2">The scene</CapsLabel>
            <ExpandableTextarea
              value={preview.scene}
              onChange={(e) => updateScene(e.target.value)}
              minHeight={100}
              aria-label="Scene"
              className="w-full r-sm border border-transparent bg-transparent px-0 py-0 font-serif text-lg italic leading-relaxed text-body outline-none transition focus:border-gold focus:px-3 focus:py-2"
            />
          </Panel>
          {nameError && (
            <p className="r-md border border-loss bg-panel px-4 py-3 text-sm text-loss">{nameError}</p>
          )}
          <div className="flex items-baseline justify-between gap-3">
            <CapsLabel>Your rivals</CapsLabel>
            <span className="text-xs text-sage-dim">
              {preview.characters.length} rivals — {preview.characters.length + 1} at the table with you
            </span>
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
            {preview.characters.map((c, i) => (
              <Panel key={i} variant="card" className="flex flex-col gap-3.5 p-5">
                <div className="flex items-center gap-3.5">
                  <Avatar name={c.name} color={AVATAR_COLORS[i % AVATAR_COLORS.length]} size="md" />
                  <div className="min-w-0 flex-1">
                    <input
                      value={c.name}
                      onChange={(e) => updateCharacter(i, { name: e.target.value })}
                      placeholder="Character name"
                      aria-label="Character name"
                      className="w-full border-b border-transparent bg-transparent font-serif text-2xl leading-tight text-cream outline-none transition placeholder:text-sage hover:border-line focus:border-gold"
                    />
                    <select
                      value={c.personaId}
                      onChange={(e) => updateCharacter(i, { personaId: e.target.value })}
                      aria-label="Persona"
                      className="mt-0.5 w-full cursor-pointer appearance-none border-none bg-transparent p-0 text-[11px] uppercase tracking-[0.18em] text-sage-dim outline-none hover:text-sage"
                    >
                      {!PERSONAS.some((p) => p.id === c.personaId) && (
                        <option value={c.personaId}>{c.personaId}</option>
                      )}
                      {PERSONAS.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <ExpandableTextarea
                  value={c.story}
                  onChange={(e) => updateCharacter(i, { story: e.target.value })}
                  minHeight={110}
                  aria-label="Character story"
                  placeholder="Character background and table demeanor…"
                  className="w-full r-sm border border-transparent bg-transparent px-0 py-0 text-sm leading-relaxed text-body outline-none transition focus:border-gold focus:px-3 focus:py-2"
                />
                <div className="mt-auto flex items-center gap-2.5 text-[11px]">
                  <span className="flex-none text-sage-dim">Played by</span>
                  <ModelSelect
                    options={pickerOptions}
                    selected={[c.modelId]}
                    onChange={(ids) => updateCharacter(i, { modelId: ids[0] ?? c.modelId })}
                    mode="single"
                    className="min-w-0 flex-1"
                  />
                </div>
              </Panel>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
