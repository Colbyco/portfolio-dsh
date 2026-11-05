import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://github.com/vuetifyjs/vuetify-loader/tree/next/packages/vite-plugin
import vuetify from 'vite-plugin-vuetify'

// https://vitejs.dev/config/
export default defineConfig({
  // [preview] relative asset paths + output straight into the portfolio's static folder
  base: './',
  build: {
    outDir: '../../public/previews/openai-chatbot',
    emptyOutDir: true,
  },
  plugins: [
		vue(),
		vuetify({ autoImport: true }),
]
})
