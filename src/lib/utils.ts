import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/**
 * Брендовые токены из src/styles/tokens.css, попадающие в неоднозначные
 * неймспейсы Tailwind. tailwind-merge знает только дефолтную шкалу, поэтому
 * `text-label` (размер) он по умолчанию считал цветом и вычищал соседний
 * `text-cream` — кастомные значения нужно перечислить явно.
 */
const fontSizes = [
  'hero',
  'hero-mobile',
  'display',
  'section',
  'body',
  'body-sm',
  'link',
  'label',
  'eyebrow',
  'micro',
]

const colors = [
  'navy',
  'cream',
  'surface',
  'surface-warm',
  'ink',
  'ink-muted',
  'ink-subtle',
  'ink-on-dark',
  'ink-on-dark-muted',
  'ink-on-dark-subtle',
  'ink-on-dark-faint',
  'line',
  'line-on-dark',
  'line-on-dark-soft',
  'danger',
]

const trackings = ['wordmark', 'eyebrow', 'brandline', 'label', 'link', 'display', 'body']

const leadings = ['tight', 'display', 'body']

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: fontSizes }],
      'text-color': [{ text: colors }],
      'bg-color': [{ bg: colors }],
      'border-color': [{ border: colors }],
      'divide-color': [{ divide: colors }],
      tracking: [{ tracking: trackings }],
      leading: [{ leading: leadings }],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
