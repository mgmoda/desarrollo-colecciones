import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Número de esta compilación. Va dentro del código y también en un archivito
// aparte, para que la app pueda preguntar si ya hay una versión más nueva
// publicada sin que nadie tenga que recargar a ciegas.
const BUILD = String(Date.now())

function versionPublicada() {
  return {
    name: 'version-publicada',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ version: BUILD }),
      })
    },
    // En desarrollo el archivo no existe en disco: se responde al vuelo.
    configureServer(server) {
      server.middlewares.use('/version.json', (_req, res) => {
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ version: BUILD }))
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), versionPublicada()],
  define: { __BUILD__: JSON.stringify(BUILD) },
})
