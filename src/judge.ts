import type { Scorer } from './types.js'

/**
 * Build a {@link Scorer} that asks an LLM judge to grade the task output
 * against the case's expected value. Scores 1 when the judge answers CORRECT,
 * 0 otherwise, with the judge's reply as the reason.
 *
 * Requires `OPENROUTER_API_KEY` in the environment.
 *
 * @param opts `model` selects the judge model (an OpenRouter model id).
 * @returns the scorer.
 */
export function llmJudge<I, O, E>(opts: { model?: string } = {}): Scorer<I, O, E> {
  const model = opts.model ?? 'anthropic/claude-haiku-4.5'

  return {
    name: 'llm-judge',
    run: async ({ input, output, expected, report }) => {
      const key = process.env.OPENROUTER_API_KEY
      if (!key) throw new Error('llmJudge requires OPENROUTER_API_KEY to be set')

      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'user',
              content: [
                'You are grading the output of a model against an expected answer.',
                `Input: ${JSON.stringify(input)}`,
                `Output: ${JSON.stringify(output)}`,
                `Expected: ${JSON.stringify(expected)}`,
                'Reply with exactly one word: CORRECT or INCORRECT.',
              ].join('\n'),
            },
          ],
        }),
      })

      if (!res.ok) throw new Error(`llmJudge request failed: ${res.status} ${await res.text()}`)

      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[]
        usage?: { prompt_tokens?: number; completion_tokens?: number }
      }

      report({ inputTokens: data.usage?.prompt_tokens ?? 0, outputTokens: data.usage?.completion_tokens ?? 0 })

      const text = data.choices?.[0]?.message?.content ?? ''
      const score = /\bCORRECT\b/i.test(text) && !/\bINCORRECT\b/i.test(text) ? 1 : 0
      return { score, reason: text.trim() }
    },
  }
}
