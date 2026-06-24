import type { GenerateArgs, GenerateFn, GenerateImpl, Usage } from './types.js'

/**
 * Wrap a {@link GenerateImpl} into a {@link GenerateFn} that binds `defaultModel`
 * when a call omits one, reports usage to `onUsage`, and returns the bare value.
 * Usage is currently always reported under the `"task"` phase.
 *
 * @param impl         the underlying model caller.
 * @param defaultModel model used when a call omits `args.model`.
 * @param onUsage      sink that receives `(phase, usage)` for every call.
 * @returns the instrumented caller.
 */
export function instrument(
  impl: GenerateImpl,
  defaultModel: string,
  onUsage: (phase: 'task' | 'judge', usage: Usage) => void,
): GenerateFn {
  return async <T>(args: GenerateArgs<T>): Promise<T> => {
    if (!args.model) args.model = defaultModel

    const result = await impl(args)

    onUsage('task', result.usage ?? { inputTokens: 0, outputTokens: 0 })

    return result.value
  }
}
