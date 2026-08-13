/**
 * A model call that failed. Tagged rather than raw so the pumps can tell "the provider
 * refused / timed out / returned garbage" (recoverable — show the retry banner) apart
 * from "our own code threw" (a bug — let it surface as a real error).
 *
 * There is deliberately no fallback anywhere: when a call fails the player is told, and
 * chooses to retry the same model or one-shot a different one. Quietly substituting a
 * dumber heuristic would hide a broken key or a bad model behind a working-looking game.
 */
export class AiCallError extends Error {
  readonly details: string;

  constructor(
    readonly actor: string,
    readonly model: string,
    readonly cause: unknown,
  ) {
    super(`${actor}'s model call failed`);
    this.name = 'AiCallError';
    this.details = cause instanceof Error ? cause.message : String(cause);
  }
}

export function isAiCallError(error: unknown): error is AiCallError {
  return error instanceof AiCallError;
}

/**
 * True when a failure was a parse/validation problem rather than a transport one — the model
 * produced something, it just wasn't usable. Matches the messages thrown by
 * `json-response-parser.ts` and by Zod. This is the only failure kind worth a retry hint:
 * a timeout or 5xx has nothing to tell the model, so those retry with an unchanged prompt.
 */
export function isResponseFormatFailure(details: string | undefined | null): boolean {
  if (!details) return false;
  return /Failed to parse JSON response|Response validation failed|validation failed|returned empty content/i.test(
    details,
  );
}

/** Run a model call, tagging any failure with who was speaking and on which model. */
export async function aiCall<T>(actor: string, model: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    throw new AiCallError(actor, model, error);
  }
}
