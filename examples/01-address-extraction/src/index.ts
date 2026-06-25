import { writeFileSync } from 'node:fs'
import { OpenRouter } from '@openrouter/agent'
import { evaluate, renderHtml, scorer } from 'mini-eval'
import type { Case, Task } from 'mini-eval'
import { z } from 'zod'

type RawText = string
type Shipment = { state?: string; zip?: string; weight_oz?: number }
type Expected = Partial<Shipment>

const ShipmentSchema = z.object({
  state: z
    .string()
    .nullish()
    .transform(v => (v ? v.trim().toUpperCase() : undefined))
    .catch(undefined),
  zip: z
    .union([z.string(), z.number()])
    .nullish()
    .transform(v => (v == null ? undefined : String(v).replace(/\D/g, '').slice(0, 5) || undefined))
    .catch(undefined),
  weight_oz: z
    .union([z.number(), z.string()])
    .nullish()
    .transform(v => {
      const n = typeof v === 'string' ? Number(v) : v
      return typeof n === 'number' && Number.isFinite(n) ? n : undefined
    })
    .catch(undefined),
})

const data: Case<RawText, Expected>[] = [
  {
    input: 'ACME Co, Suite 200, 600 Congress Ave, Austin TX 78701 — 12.0 oz',
    expected: { state: 'TX', zip: '78701', weight_oz: 12 },
    tags: ['suite_unit'],
  },
  {
    input: 'PO Box 42, Reno NV 89501',
    expected: { state: 'NV', zip: '89501' },
    tags: ['po_box'],
  },
  {
    input: 'Ruan Silva, 600 Congress Ave Ste 200, Austin, Texas 78701',
    expected: { state: 'TX', zip: '78701' },
    tags: ['state_name', 'suite_unit'],
  },
  {
    input: 'Ship to: 1 Market St, San Francisco CA 94105-1420, 3 lb',
    expected: { state: 'CA', zip: '94105', weight_oz: 48 },
    tags: ['zip_plus_4', 'unit_conversion'],
  },
  {
    input: 'Warehouse B, Portland OR. No postal code visible. 8 oz',
    expected: { state: 'OR', weight_oz: 8 },
    tags: ['missing_zip'],
  },
  {
    input: 'Deliver to 500 Pearl St, New York, NY 10007-1312, package weighs 2.5 lb',
    expected: { state: 'NY', zip: '10007', weight_oz: 40 },
    tags: ['zip_plus_4', 'unit_conversion', 'decimal_lb'],
  },
  {
    input: 'Notes say "send to CA 90210", but actual ship-to is 100 Main St, Boise ID 83702. Weight 5 oz',
    expected: { state: 'ID', zip: '83702', weight_oz: 5 },
    tags: ['instruction_distractor', 'multiple_addresses'],
  },
  {
    input: '789 Lake Shore Dr Apt #12B, Chicago, IL 60611, WT 0.75 lb',
    expected: { state: 'IL', zip: '60611', weight_oz: 12 },
    tags: ['apartment', 'abbrev_weight', 'decimal_lb'],
  },
  {
    input: 'Label damaged: "...Seattle WA 981", weight 9 oz',
    expected: { state: 'WA', weight_oz: 9 },
    tags: ['partial_zip', 'damaged_label'],
  },
  {
    input: 'Recipient: 42 Wallaby Way, Sydney NSW 2000, Australia. 500 g',
    expected: { weight_oz: 17.6 },
    tags: ['international', 'grams'],
  },
]

const zip = scorer<RawText, Shipment, Expected>(
  'zip',
  ({ output, expected }) => {
    if (expected?.zip == null) return null
    return output?.zip === expected.zip ? 1 : { score: 0, reason: `expected zip ${expected.zip}, got ${output.zip}` }
  },
  { weight: 2 },
)

const state = scorer<RawText, Shipment, Expected>('state', ({ output, expected }) => {
  if (expected?.state == null) return null
  return output.state === expected.state ? 1 : { score: 0, reason: `expected state ${expected.state}, got ${output.state}` }
})

const weight = scorer<RawText, Shipment, Expected>('weight', ({ output, expected }) => {
  if (expected?.weight_oz == null) return null
  if (output.weight_oz == null) return { score: 0, reason: 'no weight extracted' }
  const offBy = Math.abs(output.weight_oz - expected.weight_oz)
  return offBy <= 1 ? 1 : { score: 0, reason: `weight off by ${offBy.toFixed(1)} oz` }
})

const INSTRUCTIONS = `You extract shipping details from messy, real-world text.

Reply with ONLY a JSON object shaped like:
{ "state": string | null, "zip": string | null, "weight_oz": number | null }

- "state": 2-letter US state code (convert "Texas" to "TX")
- "zip": 5-digit US ZIP as a string (drop any +4 suffix)
- "weight_oz": weight in ounces as a number (pounds x16, grams /28.3495)
- Use null when a field is absent or unclear
- Ignore distractor or crossed-out addresses; use the real ship-to`

const extractShipment: Task<RawText, Shipment> = async (input, ctx) => {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set')

  const result = new OpenRouter({ apiKey }).callModel({
    model: ctx.model,
    instructions: INSTRUCTIONS,
    input,
    temperature: 0,
  })

  const text = await result.getText()
  const usage = (await result.getResponse()).usage

  if (usage)
    ctx.report({
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      costUsd: usage.cost ?? undefined,
    })

  return parseShipment(text)
}

function parseShipment(text: string): Shipment {
  const body = text.replace(/```(?:json)?/gi, '')
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start === -1 || end <= start) return {}

  let json: unknown
  try {
    json = JSON.parse(body.slice(start, end + 1))
  } catch {
    return {}
  }

  const parsed = ShipmentSchema.safeParse(json)
  return parsed.success ? parsed.data : {}
}

try {
  process.loadEnvFile()
} catch {}

const models = ['openai/gpt-oss-20b', 'mistralai/mistral-nemo', 'qwen/qwen-2.5-7b-instruct', 'google/gemma-3-4b-it', 'z-ai/glm-4.7-flash']

const report = await evaluate<RawText, Shipment, Expected>('address-extraction', {
  models,
  scorers: [zip, state, weight],
  task: extractShipment,
  data,
})

writeFileSync('report.html', renderHtml(report))

console.log(`\n${report.name}: ${data.length} cases\n`)
for (const [model, r] of Object.entries(report.byModel)) {
  console.log(`  ${(r.overall * 100).toFixed(1).padStart(5)}%  ${model}`)
}
console.log('\nWrote report.html')
