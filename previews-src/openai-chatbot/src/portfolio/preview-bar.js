// [preview] Wires the portfolio bar (index.html) to the OpenAI bridge. Not part of the 2022 app.
import './preview.css'
import { setPreviewKey, clearPreviewKey, hasPreviewKey, LIVE_MODEL } from './openai-bridge.js'

const form = document.getElementById('portfolio-key-form')
const input = document.getElementById('portfolio-key')
const clear = document.getElementById('portfolio-key-clear')
const status = document.getElementById('portfolio-key-status')

function render(message) {
  status.textContent = message || (hasPreviewKey() ? `Key set · replies via ${LIVE_MODEL}` : 'No key')
  status.dataset.state = hasPreviewKey() ? 'on' : 'off'
}

form.addEventListener('submit', (event) => {
  event.preventDefault()
  const value = input.value.trim()
  if (!value) {
    render(hasPreviewKey() ? '' : 'Paste a key first')
    input.focus()
    return
  }
  setPreviewKey(value)
  input.value = '' // do not leave the key in the DOM
  render()
})

clear.addEventListener('click', () => {
  clearPreviewKey()
  input.value = ''
  render('Key cleared')
})

render()
