/**
 * Helper for the examples: call a model through OpenRouter and return the parsed
 * value plus usage. With a `schema` it requests `json_schema` output and
 * validates it back to `T`; without one it returns the model's text. The task
 * (or judge) then reports the usage via `ctx.report(usage)`.
 *
 * mini-eval itself ships no model caller — this lives in the examples. Copy and
 * adapt it for your own provider.
 *
 * Needs `OPENROUTER_API_KEY` in the environment.
 */
import z from 'zod'
import type { ZodType } from 'zod'
import { OpenRouter } from '@openrouter/agent'
import type { CallModelInput } from '@openrouter/agent'
import type { Usage } from '../src/index.js'

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

export async function callModel<T>(model: string, prompt: string, schema?: ZodType<T>): Promise<{ value: T; usage: Usage }> {
  const options: CallModelInput = { model, input: prompt }

  if (schema) {
    options.text = {
      format: {
        type: 'json_schema' as const,
        name: 'output',
        strict: true,
        schema: z.toJSONSchema(schema) as Record<string, unknown>,
      },
    }
  }

  const result = openrouter.callModel(options)

  // One underlying request; both consumers read the same reusable stream.
  const [text, response] = await Promise.all([result.getText(), result.getResponse()])

  const usage = toUsage(response.usage)

  if (schema) {
    // Validate the model's JSON back to `T`.
    return { value: schema.parse(JSON.parse(text)), usage }
  }

  // No schema → return the raw text as `T`.
  return { value: text as unknown as T, usage }
}
