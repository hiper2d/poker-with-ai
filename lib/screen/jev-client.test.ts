/* eslint-disable @typescript-eslint/no-explicit-any -- untyped JSON from the judge APIs; kept in step with werewolf's copy */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
/**
 * askJev's own timeout: a stalled request is aborted on our clock, reported with status null
 * and the elapsed time, so the callers (screen: fail open, router: fall back to the GM) can act.
 */
import { askJev, JevError } from '@/lib/screen/jev-client';

/** A fetch that never answers and rejects only when its signal aborts, like a real stalled request. */
function stalledFetch() {
    return vi.fn((_url: string, init: { signal: AbortSignal }) => new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(new DOMException('This operation was aborted', 'AbortError')));
    }));
}

describe('askJev timeout', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('aborts a stalled request at timeoutMs and reports the elapsed time', async () => {
        const fetchMock = stalledFetch();
        (global as any).fetch = fetchMock;
        const call = askJev('key', 'state', {}, { timeoutMs: 5_000 });
        const settled = vi.fn();
        call.then(settled, settled);

        await vi.advanceTimersByTimeAsync(4_999);
        expect(settled).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);

        const error = await call.catch(e => e);
        expect(error).toBeInstanceOf(JevError);
        expect(error.message).toBe('Jev request timed out after 5000 ms');
        expect(error.status).toBeNull();
        expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    });

    it('defaults to 15 s when no timeout is given', async () => {
        (global as any).fetch = stalledFetch();
        const call = askJev('key', 'state', {});
        const settled = vi.fn();
        call.then(settled, settled);

        await vi.advanceTimersByTimeAsync(14_999);
        expect(settled).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);
        expect((await call.catch(e => e)).message).toBe('Jev request timed out after 15000 ms');
    });

    it('a network error is not reported as a timeout', async () => {
        (global as any).fetch = vi.fn(async () => { throw new TypeError('fetch failed'); });
        const error = await askJev('key', 'state', {}, { timeoutMs: 5_000 }).catch(e => e);
        expect(error).toBeInstanceOf(JevError);
        expect(error.message).toBe('Jev request failed after 0 ms: fetch failed');
        expect(error.status).toBeNull();
    });
});
