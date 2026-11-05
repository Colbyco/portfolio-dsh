// [preview] Bridge for the app's single OpenAI call site.
//
// The 2022 app used the `openai` v3 SDK (`new OpenAIApi(new Configuration({ apiKey }))`) and
// called `createCompletion({ model: "text-davinci-002", prompt, max_tokens, temperature })`,
// then read `response.data.choices[0].text`. OpenAI shut text-davinci-002 down on 2024-01-04 and
// its replacement, gpt-3.5-turbo-instruct, on 2026-09-28 (see PREVIEW.md).
//
// This module exposes the same tiny SDK surface HelloWorld.vue uses, so the component keeps its
// code. createCompletion sends the original prompt, temperature and max_tokens unchanged to this
// site's proxy (api/chatbot.js), which forwards them to gpt-3.5-turbo-0613, the closest
// surviving GPT-3.5 model, and returns the reply in the original `choices[0].text` shape.
// No visitor key is needed. Errors come back as a clearly labelled notice, never a fake reply.

export const RETIRED_MODEL = 'text-davinci-002'
export const LIVE_MODEL = 'gpt-3.5-turbo-0613'
const PROXY = '/api/chatbot/completions'

// The original UI required a valid key before chatting; the portfolio's proxy now supplies one,
// so the original key check is always satisfied (see HelloWorld.vue apiValidation).
export const hasPreviewKey = () => true

const notice = (text) => `[Preview notice - not an AI reply] ${text}`
const asCompletion = (text) => ({ data: { choices: [{ text }] } })

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
  // rejects on failure so the original catch branch runs unchanged. Not needed to chat any more.
  async listModels() {
    const key = this.configuration.apiKey
    const res = await fetch('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${key}` } })
    if (!res.ok) throw new Error(`listModels failed: ${res.status}`)
    return { data: await res.json() }
  }

  // Never throws: the original call site has no try/catch, so errors are returned as text.
  async createCompletion(params = {}) {
    let res
    try {
      res = await fetch(PROXY, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: params.prompt, max_tokens: params.max_tokens, temperature: params.temperature }),
      })
    } catch (err) {
      return asCompletion(notice(`Could not reach the chat service (${err && err.message ? err.message : 'network error'}).`))
    }
    let json = null
    try {
      json = await res.json()
    } catch {
      /* not JSON */
    }
    if (!res.ok) {
      const msg = json && json.error && json.error.message ? String(json.error.message).slice(0, 220) : res.statusText
      return asCompletion(notice(msg || `Request failed (${res.status}).`))
    }
    const text = json && json.choices && json.choices[0] && json.choices[0].text
    if (typeof text !== 'string' || !text.trim()) return asCompletion(notice('The model returned no text.'))
    return asCompletion(text)
  }
}
