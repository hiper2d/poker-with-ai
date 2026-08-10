export interface GamePreviewInput {
  theme: string;
  humanPlayerName: string;
  playerCount: number; // 2..8 including the human
  botModelIds: string[]; // deck the bots' models are dealt from
  gmModelId: string;
}

export interface CharacterPreview {
  name: string;
  gender: string;
  story: string;
  personaId: string;
  modelId: string; // dealt from the deck, editable in the preview UI later
}

export interface GamePreview {
  scene: string;
  characters: CharacterPreview[];
}
