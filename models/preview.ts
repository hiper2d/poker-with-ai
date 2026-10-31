export interface GamePreviewInput {
  theme: string;
  humanPlayerName: string;
  playerCount: number; // 2..8 including the human
  botModelIds: string[]; // deck the bots' models are dealt from
  gmModelId: string;
  /** Optional art direction for portraits and scenes (image prompts only, never the story). */
  artStyle?: string;
}

export interface CharacterPreview {
  name: string;
  gender: string;
  story: string;
  personaId: string;
  /** Appearance only — becomes this character's portrait prompt. Editable like the story. */
  visualDescription: string;
  modelId: string; // dealt from the deck, editable in the preview UI later
}

export interface GamePreview {
  scene: string;
  characters: CharacterPreview[];
  /** Set when the content screen judged the art style undrawable and set it aside. */
  artStyleNotice?: string;
}
