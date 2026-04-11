import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import { generateThemeBootInlineScript } from './src/theme-boot.ts'

function shortCacheVersion(swSource: string, assetPaths: string[]) {
  return createHash('sha256')
    .update(swSource)
    .update('\0')
    .update(assetPaths.join('|'))
    .digest('hex')
    .slice(0, 12)
}

export default defineConfig({
  build: {
    target: 'esnext',
  },
  plugins: [
    {
      name: 'theme-boot-inline',
      transformIndexHtml(html) {
        const marker = '<!--theme-boot-->'
        if (!html.includes(marker)) {
          this.warn('theme-boot-inline: <!--theme-boot--> marker missing in index.html')
          return html
        }
        const inline = generateThemeBootInlineScript()
        return html.replace(marker, `<script>${inline}</script>`)
      },
    },
    {
      // After Vite writes the bundle, inject precache URLs and a content-derived
      // cache version into dist/sw.js.
      name: 'sw-precache-manifest',
      apply: 'build',
      writeBundle(_, bundle) {
        const assets = Object.keys(bundle)
          .filter((k) => k.startsWith('assets/'))
          // Skip .ttf only — keep woff2 + woff so KaTeX CSS fallbacks work offline.
          .filter((k) => !k.endsWith('.ttf'))
          .map((k) => '/' + k)
          .sort()

        const swPublicPath = resolve('public/sw.js')
        const swSource = readFileSync(swPublicPath, 'utf8')
        const version = shortCacheVersion(swSource, assets)

        const swPath = resolve('dist/sw.js')
        let out = readFileSync(swPath, 'utf8')
        out = out.replace('/* PRECACHE_MANIFEST */ []', JSON.stringify(assets))
        out = out.replace(
          "const VERSION = '__SW_CACHE_VERSION__'",
          `const VERSION = ${JSON.stringify(version)}`
        )

        if (
          out.includes('__SW_CACHE_VERSION__') ||
          out.includes('/* PRECACHE_MANIFEST */')
        ) {
          this.warn(
            'sw-precache-manifest: failed to inject manifest or version in dist/sw.js'
          )
          return
        }
        writeFileSync(swPath, out)
      },
    },
  ],
})
