// [preview] Bridge for the app's single OpenAI call site.
//
// The 2022 app used the `openai` v3 SDK (`new OpenAIApi(new Configuration({ apiKey }))`) and
// called `createCompletion({ model: "text-davinci-002", prompt, max_tokens, temperature })`,
// then read `response.data.choices[0].text`. text-davinci-002 was shut down by OpenAI on
// 2024-01-04, and every model the legacy /v1/completions endpoint accepted has since been shut
// down too (see PREVIEW.md). This module exposes the same tiny SDK surface HelloWorld.vue uses,
// so the component keeps its code and the original UI renders whatever text we return.
//
//   * Key: comes from the preview bar (setPreviewKey) and lives only in this module variable
//     (tab memory). It is never written to storage and is only sent to api.openai.com.
//     A key typed into the app's own drawer field still works exactly as in 2022: it is used
//     only after the original 51-character + listModels() validation succeeded.
//   * With a key: the completion prompt is translated to Chat Completions with a current small
//     model, and the reply text is returned in the original `choices[0].text` shape.
//   * Without a key, or on any error: a clearly labelled preview notice is returned as the
//     bot's text. No AI answer is ever fabricated.

import { ref } from 'vue'

const API = 'https://api.openai.com/v1'
export const RETIRED_MODEL = 'text-davinci-002'
export const LIVE_MODEL = 'gpt-6-luna'

// Memory only (a Vue ref so the original key hint under the Message field updates when it changes).
const previewKey = ref('')
const validatedDrawerKeys = new Set() // keys that passed the original listModels() validation

export function setPreviewKey(key) {
  previewKey.value = String(key || '').trim()
}
export function clearPreviewKey() {
  previewKey.value = ''
}
export function hasPreviewKey() {
  return previewKey.value.length > 0
}

const notice = (text) => `[Preview notice - not an AI reply] ${text}`
const asCompletion = (text) => ({ data: { choices: [{ text }] } })

async function readError(res) {
  try {
    const body = await res.json()
    const msg = body && body.error && body.error.message
    if (msg) return String(msg).slice(0, 220)
  } catch {
    /* not JSON */
  }
  return res.statusText || 'request failed'
}

// Original prompt: `You are a chat bot\n--------\nuser:${m}\nyou:`
function toMessages(prompt) {
  const match = /^([\s\S]*?)\n-{3,}\nuser:([\s\S]*)\nyou:\s*$/.exec(String(prompt))
  if (!match) return [{ role: 'user', content: String(prompt) }]
  return [
    { role: 'developer', content: match[1].trim() },
    { role: 'user', content: match[2] },
  ]
}

export class Configuration {
  constructor({ apiKey } = {}) {
    this.apiKey = String(apiKey || '').trim()
  }
}

export class OpenAIApi {
  constructor(configuration) {
    this.configuration = configuration || new Configuration()
  }

  // Used by the original drawer-key validation (apiValidation). Same request as the v3 SDK;
  // rejects on failure so the original catch branch runs unchanged.
  async listModels() {
    const key = this.configuration.apiKey
    const res = await fetch(`${API}/models`, { headers: { Authorization: `Bearer ${key}` } })
    if (!res.ok) throw new Error(`listModels failed: ${res.status}`)
    validatedDrawerKeys.add(key)
    return { data: await res.json() }
  }

  // Never throws: the original call site has no try/catch, so errors are returned as text.
  async createCompletion(params = {}) {
    const drawerKey = this.configuration.apiKey
    const key = previewKey.value || (validatedDrawerKeys.has(drawerKey) ? drawerKey : '')
    if (!key) {
      return asCompletion(
        notice(
          `${RETIRED_MODEL} was retired by OpenAI, so live replies need your own OpenAI API key. ` +
            'Paste one in the bar above this app, then send your message again.',
        ),
      )
    }
    const body = {
      model: LIVE_MODEL,
      messages: toMessages(params.prompt),
      max_completion_tokens: params.max_tokens,
      temperature: params.temperature,
      reasoning_effort: 'none', // required for `temperature` on current models
    }
    let res
    try {
      res = await fetch(`${API}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify(body),
      })
    } catch (err) {
      return asCompletion(notice(`Could not reach api.openai.com (${err && err.message ? err.message : 'network error'}).`))
    }
    if (!res.ok) {
      return asCompletion(notice(`OpenAI returned an error (${res.status}): ${await readError(res)}`))
    }
    const json = await res.json()
    const text = json && json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content
    if (typeof text !== 'string' || !text.trim()) {
      return asCompletion(notice(`OpenAI returned no text (finish_reason: ${json?.choices?.[0]?.finish_reason ?? 'unknown'}).`))
    }
    return asCompletion(text)
  }
}
