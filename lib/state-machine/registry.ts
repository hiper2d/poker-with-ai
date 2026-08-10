import type { GameState } from '@/models/game';
import type { StateHandler, StateHandlerFactory } from './types';

const handlers = new Map<GameState, StateHandlerFactory>();

export function registerHandler(state: GameState, factory: StateHandlerFactory): void {
  handlers.set(state, factory);
}

export function resolveHandler(state: GameState): StateHandler {
  const factory = handlers.get(state);
  if (!factory) throw new Error(`No handler registered for state ${state}`);
  return factory();
}

// Handler implementations live in lib/state-machine/handlers/ and self-register here.
// TODO(skeleton): implement WelcomeHandler, HandSetupHandler, BettingHandler,
// ShowdownHandler, HandResultsHandler, CompactionHandler.
