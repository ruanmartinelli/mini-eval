/**
 * Await a promise and return an `[error, result]` tuple instead of throwing.
 *
 * @param promise the promise to await.
 * @returns `[null, result]` on success, `[error, undefined]` on rejection.
 */
export async function to<T>(promise: Promise<T>): Promise<[Error | null, T | undefined]> {
  try {
    const data = await promise
    return [null, data]
  } catch (err) {
    return [err instanceof Error ? err : new Error(String(err)), undefined]
  }
}
