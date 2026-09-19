'use client'

import { formatLocalPhone, PHONE_PREFIX, toLocalPhoneDigits } from '@/lib/orders/phone'

/**
 * Маска молдавского номера: пользователь видит и правит только восемь цифр
 * после +373, префикс нередактируем. На отправку уходит `+373XXXXXXXX`.
 *
 * Общее поле проекта (перенесено из `components/cart/` 2026-09-19): форма
 * заявки, поиск заказа по номеру, шаг подтверждения телефона у промокода в
 * корзине и попап «первая скидка» используют ОДИН компонент — иначе правила
 * ввода расходятся между экранами.
 *
 * **Ввод, вставка и автозаполнение идут одним путём** — через
 * `toLocalPhoneDigits` (`src/lib/orders/phone.ts`), потому что все три
 * приходят в один и тот же `onChange`: браузер при автозаполнении выставляет
 * значение и шлёт обычное `input`-событие, отличить его от вставки нельзя, да
 * и не нужно. Функция снимает `00373` / `373` / ведущий ноль и оставляет
 * восемь цифр, поэтому `+37360123456`, `060123456` и `60 123 456` дают один и
 * тот же номер. Ту же функцию использует `normalizePhone` на сервере —
 * правила не продублированы.
 *
 * `autoComplete="tel-national"` — поле хранит именно НАЦИОНАЛЬНУЮ часть
 * номера, код страны показан отдельной нередактируемой плашкой. Если браузер
 * вопреки этому подставит полный международный номер (а он так делает,
 * когда в профиле сохранён только он), разбор всё равно приведёт его к тем же
 * восьми цифрам — поле переживает оба варианта автозаполнения.
 */
export function PhoneInput({
  value,
  onChange,
  invalid,
  label,
  required,
  name,
}: {
  /** Только цифры местного номера, без кода страны. */
  value: string
  onChange: (digits: string) => void
  invalid?: boolean
  label: string
  /** Только для нативной подсветки пустого поля: длину проверяет форма. */
  required?: boolean
  name?: string
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
        name={name}
        required={required}
        type="tel"
        // `numeric`, а не `tel`: цифровая клавиатура без символов набора —
        // плюс и скобки полю не нужны, код страны показан слева плашкой.
        inputMode="numeric"
        autoComplete="tel-national"
        aria-label={label}
        aria-invalid={invalid || undefined}
        value={formatLocalPhone(value)}
        onChange={(event) => onChange(toLocalPhoneDigits(event.target.value))}
        placeholder="60 123 456"
        className="text-ink text-body-sm placeholder:text-ink-subtle w-full bg-transparent px-3 py-2.5 outline-none"
      />
    </div>
  )
}
