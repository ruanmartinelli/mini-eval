/**
 * The smallest thing that works: a one-call `task` plus a few scorers, swept
 * across several models. The task calls the model via the example `callModel`
 * helper and reports usage with `ctx.report`.
 *
 * Run with:  npm run example:extraction
 * (Makes real model calls — needs OPENROUTER_API_KEY in your environment / .env.)
 */
import 'dotenv/config'
import { z } from 'zod'
import { evaluate, scorer } from '../src/index.js'
import { callModel } from './openrouter-caller.js'

/** The structured output we extract. `output` inside scorers is typed to this. */
const Shipment = z.object({
  state: z.string(),
  zip: z.string().nullable(),
  weight_oz: z.number().nullable(),
})
type Shipment = z.infer<typeof Shipment>

/** Raw address/label text to extract from. */
type RawText = string

/** `expected` asserts only what matters: a case may pin some fields, not all. */
type Expected = Partial<Shipment>

// --- scorers: plain functions. Weight is separate from correctness. ---

const zip = scorer<RawText, Shipment, Expected>(
  'zip',
  ({ output, expected }) => {
    if (expected?.zip == null) return null // nothing to assert here
    // `output` is typed as Shipment — `output.zip` is a string.
    return output?.zip === expected.zip ? 1 : { score: 0, reason: `expected zip ${expected.zip}, got ${output.zip}` }
  },
  { weight: 2 }, // zip correctness counts double
)

const state = scorer<RawText, Shipment, Expected>('state', ({ output, expected }) => {
  if (expected?.state == null) return null
  return output.state === expected.state ? 1 : { score: 0, reason: `expected state ${expected.state}, got ${output.state}` }
})

const weight = scorer<RawText, Shipment, Expected>('weight', ({ output, expected }) => {
  if (expected?.weight_oz == null) return null // no expected weight → N/A
  if (output.weight_oz == null) return { score: 0, reason: 'no weight extracted' }
  const offBy = Math.abs(output.weight_oz - expected.weight_oz)
  return offBy <= 1 ? 1 : { score: 0, reason: `weight off by ${offBy.toFixed(1)} oz` }
})

// --- the eval: sweep several models; the report is model × tag. ---

const report = await evaluate<RawText, Shipment, Expected>('extraction', {
  models: ['openai/gpt-oss-20b', 'mistralai/mistral-nemo', 'qwen/qwen-2.5-7b-instruct', 'google/gemma-3-4b-it', 'z-ai/glm-4.7-flash'], // OpenRouter slugs

  // The task calls the model itself and reports usage. `ctx.model` is the swept model.
  task: async (text, ctx) => {
    const prompt = `Extract the shipment fields (state, ZIP, weight in oz) from this label.\n` + `Use null for weight if it is not stated.\n\n${text}`
    const { value, usage } = await callModel(ctx.model, prompt, Shipment)
    ctx.report(usage)
    return value
  },

  data: [
    {
      input: 'ACME Co, Suite 200, 600 Congress Ave, Austin TX 78701 — 12.0 oz',
      expected: { state: 'TX', zip: '78701', weight_oz: 12 },
      tags: ['suite_unit'],
    },
    {
      // No weight on this case → the `weight` scorer returns null and is dropped.
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
  ],

  scorers: [zip, state, weight],
})

// `evaluate` returns data, so CI can gate on it. Iterate the per-model results
// to enforce a floor.
const FLOOR = 0.8
for (const [model, modelReport] of Object.entries(report.byModel)) {
  if (modelReport.overall < FLOOR) {
    console.error(`✗ ${model} scored ${modelReport.overall.toFixed(2)} (< ${FLOOR})`)
    process.exitCode = 1
  }
}
