import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import i18n from './index'
import en from './locales/en.json'
import itLocale from './locales/it.json'

// Recursively collect source files under src/, excluding the i18n locales dir.
function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (p.includes(`${join('src', 'i18n', 'locales')}`)) continue
    if (statSync(p).isDirectory()) walk(p, acc)
    else if (/\.tsx?$/.test(p) && !/\.test\.tsx?$/.test(p)) acc.push(p)
  }
  return acc
}

const files = walk(join(process.cwd(), 'src'))
const contents = files.map((f) => ({ f, src: readFileSync(f, 'utf8') }))

function has(obj: Record<string, unknown>, dotted: string): boolean {
  return dotted.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj) !== undefined
}

/** Recursively flatten a locale object into dotted leaf keys. */
function flattenKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? flattenKeys(v as Record<string, unknown>, `${prefix}${k}.`)
      : [`${prefix}${k}`],
  )
}

describe('i18n coverage guard (english-ui)', () => {
  it('every t("…") key used in source exists in en.json', () => {
    const missing: string[] = []
    for (const { f, src } of contents) {
      const re = /['"]([a-zA-Z0-9_.]+)['"]/g
      // Only inspect keys that look like translation keys (dot namespaced) used with t(...).
      // The class includes A-Z: camelCase keys (plan.createBtn, ai.keySpace, …) must be
      // checked too — a lowercase-only class silently skipped all of them. Dynamic keys
      // built from template literals can't match statically; that's acceptable.
      const tre = /\bt\(\s*['"]([a-zA-Z0-9_.]+)['"]\s*([,)])/g
      let m: RegExpExecArray | null
      while ((m = tre.exec(src))) {
        const key = m[1]
        if (key.includes('.')) {
          // With `count`, i18next resolves key_one/key_other and falls back to
          // the base key (valid for "{{count}} items" single-form strings).
          // Accept any of the three; flag only when none exists.
          const ok = has(en, key) || has(en, `${key}_one`) || has(en, `${key}_other`)
          if (!ok) missing.push(`${key} (${f.split('/').pop()})`)
        }
      }
      void re
    }
    expect(missing).toEqual([])
  })

  it('en.json and it.json expose exactly the same key set (parity)', () => {
    const enKeys = new Set(flattenKeys(en as Record<string, unknown>))
    const itKeys = new Set(flattenKeys(itLocale as Record<string, unknown>))
    const missingIt = [...enKeys].filter((k) => !itKeys.has(k))
    const missingEn = [...itKeys].filter((k) => !enKeys.has(k))
    expect({ missingIt, missingEn }).toEqual({ missingIt: [], missingEn: [] })
  })

  it('no Italian UI string literals remain in migrated components', () => {
    const itWords = /\b(Cartella|Cestino|caricamento|Caricamento|usati|disponibili|sposta|copia|selezionat|Elaboro|ignoti|radice|Svuota|Apri|Nascondi|Mostra|Terminale|verifica|ripristin|creato|vuoto|errori)\b/
    const offenders: string[] = []
    for (const { f, src } of contents) {
      // strip // line comments and /* */ blocks so comments don't false-positive
      const stripped = src.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
      // look only inside string literals and >text< nodes
      const strings = [...stripped.matchAll(/'([^'\n]*)'|`([^`\n]*)`|>([^<>\n]*[A-Za-zÀ-ÿ][^<>\n]*)</g)]
      for (const s of strings) {
        const val = s[1] ?? s[2] ?? s[3] ?? ''
        if (itWords.test(val)) offenders.push(`${f.split('/').pop()}: ${val.trim().slice(0, 40)}`)
      }
    }
    expect(offenders).toEqual([])
  })
})

describe('language default + plurals', () => {
  it('defaults to English', async () => {
    await i18n.changeLanguage('en')
    expect(i18n.language).toBe('en')
    expect(i18n.t('count.elements', { count: 1 })).toBe('1 element')
    expect(i18n.t('count.elements', { count: 5 })).toBe('5 elements')
  })
  it('switches to Italian', async () => {
    await i18n.changeLanguage('it')
    expect(i18n.t('count.elements', { count: 5 })).toBe('5 elementi')
    expect(i18n.t('modal.deleteBody', { count: 2 })).toContain('elementi')
    await i18n.changeLanguage('en')
  })
})
