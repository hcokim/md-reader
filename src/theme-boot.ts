/**
 * Single source of truth for theme localStorage keys, boot class name, and dark
 * canvas colors before bundled CSS loads. Used by `themes.ts` and injected into
 * `index.html` by the `theme-boot-inline` Vite plugin.
 */

export const THEME_STORAGE_KEYS = {
  theme: 'md-reader-theme',
  width: 'md-reader-width',
  colorMode: 'md-reader-color-mode',
} as const

export const THEME_BOOT_CLASS = 'mdr-boot-dark'

/** Dark page background during boot; align with dark `--bg` per theme in style.css */
export const THEME_BOOT_DARK_BG: Record<string, string> = {
  github: '#0d1117',
  serif: '#1c1a17',
  sans: '#111111',
  mono: '#100f0f',
  miranda: '#12131a',
}

export const THEME_BOOT_DARK_FALLBACK = '#0d1117'

export const THEME_DEFAULTS = {
  theme: 'github',
  width: 'medium',
  colorMode: 'auto',
} as const

/** Minified IIFE: set body data-* from localStorage; paint html dark canvas when needed. */
export function generateThemeBootInlineScript(): string {
  const K = THEME_STORAGE_KEYS
  const D = THEME_DEFAULTS
  return [
    '(function(){',
    `var TK=${JSON.stringify(K.theme)};`,
    `var WK=${JSON.stringify(K.width)};`,
    `var CK=${JSON.stringify(K.colorMode)};`,
    `var darkBg=${JSON.stringify(THEME_BOOT_DARK_BG)};`,
    `var defTheme=${JSON.stringify(D.theme)};`,
    `var defWidth=${JSON.stringify(D.width)};`,
    `var defMode=${JSON.stringify(D.colorMode)};`,
    `var darkFallback=${JSON.stringify(THEME_BOOT_DARK_FALLBACK)};`,
    `var bootClass=${JSON.stringify(THEME_BOOT_CLASS)};`,
    "function resolve(m){if(m==='dark')return'dark';if(m==='light')return'light';return window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}",
    'var theme=localStorage.getItem(TK)||defTheme;',
    'var width=localStorage.getItem(WK)||defWidth;',
    'var colorMode=localStorage.getItem(CK)||defMode;',
    'var resolved=resolve(colorMode);',
    'var b=document.body;',
    "b.setAttribute('data-theme',theme);",
    "b.setAttribute('data-width',width);",
    "b.setAttribute('data-color-mode',resolved);",
    "if(resolved==='dark'){var bootBg=darkBg[theme]||darkFallback;document.documentElement.classList.add(bootClass);document.documentElement.style.setProperty('--mdr-boot-bg',bootBg)}",
    '})()',
  ].join('')
}
