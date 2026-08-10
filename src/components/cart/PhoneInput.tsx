'use client'

/**
 * Маска молдавского номера: пользователь видит и правит только восемь цифр
 * после +373, префикс нередактируем. На отправку уходит `+373XXXXXXXX`.
 */
export const PHONE_PREFIX = '+373'
const MAX_DIGITS = 8

export const digitsOf = (value: string) => value.replace(/\D/g, '').slice(0, MAX_DIGITS)

/** «60 123 456» — читаемая группировка для поля ввода. */
export function formatLocalPhone(digits: string): string {
  const clean = digitsOf(digits)
  const parts = [clean.slice(0, 2), clean.slice(2, 5), clean.slice(5, 8)].filter(Boolean)
  return parts.join(' ')
}

export function PhoneInput({
  value,
  onChange,
  invalid,
  label,
}: {
  value: string
  onChange: (digits: string) => void
  invalid?: boolean
  label: string
}) {
  return (
    <div
      className={`flex items-center rounded-sm border transition-colors ${
        invalid ? 'border-danger' : 'border-line focus-within:border-navy'
      }`}
    >
      <span className="text-ink-muted text-body-sm border-line border-r px-3 py-2.5">
        {PHONE_PREFIX}
      </span>
      <input
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        aria-label={label}
        aria-invalid={invalid || undefined}
        value={formatLocalPhone(value)}
        onChange={(event) => onChange(digitsOf(event.target.value))}
        placeholder="60 123 456"
        className="text-ink text-body-sm placeholder:text-ink-subtle w-full bg-transparent px-3 py-2.5 outline-none"
      />
    </div>
  )
}
