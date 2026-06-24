/**
 * An example `GenerateImpl` built on OpenRouter's `@openrouter/agent` SDK: one
 * key reaches every provider, and model ids are `provider/model` slugs. Pass it
 * to `evaluate` via `config.generate`. Copy and adapt it for your own provider —
 * mini-eval itself ships no model caller.
 *
 * Needs `OPENROUTER_API_KEY` in the environment.
 */
import z from 'zod'
import { OpenRouter } from '@openrouter/agent'
import type { CallModelInput } from '@openrouter/agent'
import type { GenerateArgs, GenerateImpl, Usage } from '../src/index.js'

const openrouter = new OpenRouter({ apiKey: process.env.OPENROUTER_API_KEY })

/** The subset of OpenRouter's usage payload we read. */
type SdkUsage = { inputTokens?: number; outputTokens?: number; cost?: number | null }

/** Map OpenRouter's usage payload onto mini-eval's {@link Usage}. */
function toUsage(usage: SdkUsage | null | undefined): Usage {
  return {
    inputTokens: usage?.inputTokens ?? 0,
    outputTokens: usage?.outputTokens ?? 0,
    costUsd: usage?.cost ?? undefined,
  }
}

/**
 * With a `schema` it requests `json_schema` output and validates it back to `T`;
 * without one it returns the model's text. Throws if `args.model` is unset
 * (`instrument` normally binds the swept model for you).
 */
export const openrouterCaller: GenerateImpl = async <T>(args: GenerateArgs<T>): Promise<{ value: T; usage?: Usage }> => {
  if (!args.model) {
    throw new Error('openrouterCaller requires an explicit `model`; instrument() normally binds it for you.')
  }

  const options: CallModelInput = {
    model: args.model,
    input: args.prompt,
    temperature: args.temperature,
  }

  if (args.schema) {
    options.text = {
      format: {
        type: 'json_schema' as const,
        name: 'output',
        strict: true,
        schema: z.toJSONSchema(args.schema) as Record<string, unknown>,
      },
    }
  }

  const result = openrouter.callModel(options)

  // One underlying request; both consumers read the same reusable stream.
  const [text, response] = await Promise.all([result.getText(), result.getResponse()])

  const usage = toUsage(response.usage)

  if (args.schema) {
    // Validate the model's JSON back to `T`.
    return { value: args.schema.parse(JSON.parse(text)), usage }
  }

  // No schema → return the raw text as `T`.
  return { value: text as unknown as T, usage }
}
