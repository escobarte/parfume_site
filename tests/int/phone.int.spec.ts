import { describe, expect, it } from 'vitest'
import {
  formatLocalPhone,
  isValidPhone,
  normalizePhone,
  PHONE_PATTERN,
  stripPhonePrefixes,
  toLocalPhoneDigits,
} from '@/lib/orders/phone'

/**
 * Разбор телефона (2026-09-19). До этой правки поле ввода брало просто первые
 * восемь цифр строки, поэтому вставка `+37360123456` давала `37360123`, а
 * `060123456` — `06012345`; оба потом собирались в `+373…` и ПРОХОДИЛИ
 * серверную проверку, потому что длина сходилась. Теперь правило одно на
 * браузер и сервер, а таблица ниже — его спецификация.
 *
 * Ключевая разница ролей: поле обрезает результат до восьми цифр (оно столько
 * и вмещает), сервер не обрезает — лишние цифры обязаны провалить проверку, а
 * не превратиться в правдоподобный чужой номер.
 */

/** Записи одного и того же номера +373 60 123 456. */
const SAME_NUMBER = [
  ['60123456', 'обычный набор восьми цифр'],
  ['60 123 456', 'с пробелами'],
  ['+37360123456', 'международная запись'],
  ['+373 60 123 456', 'международная с пробелами'],
  ['+373-60-123-456', 'международная с дефисами'],
  ['(373) 60 123 456', 'код страны в скобках'],
  ['373 60 123 456', 'код страны без плюса'],
  ['00373 60 123 456', 'международный префикс набора'],
  ['0037360123456', 'префикс набора без пробелов'],
  ['060123456', 'местная запись с национальным нулём'],
  ['0 60 123 456', 'национальный ноль с пробелами'],
  ['0 373 60 123 456', 'и ноль, и код страны'],
  ['tel:+373.60.123.456', 'мусор вокруг цифр'],
] as const

describe('поле ввода: toLocalPhoneDigits', () => {
  it.each(SAME_NUMBER)('%s (%s) → 60123456', (typed) => {
    expect(toLocalPhoneDigits(typed)).toBe('60123456')
  })

  it.each([
    ['', ''],
    ['6', '6'],
    ['60', '60'],
    ['601234', '601234'],
    ['6012345', '6012345'],
  ])('обрезок «%s» остаётся как есть: человек ещё набирает', (typed, expected) => {
    expect(toLocalPhoneDigits(typed)).toBe(expected)
  })

  it('восьмизначный номер, начинающийся с 0 или 373, не калечится', () => {
    // Префиксы снимаются, только пока цифр БОЛЬШЕ восьми: у местного номера
    // их нет по определению, значит и снимать нечего.
    expect(toLocalPhoneDigits('03712345')).toBe('03712345')
    expect(toLocalPhoneDigits('37312345')).toBe('37312345')
  })

  it('лишние цифры обрезаются до восьми — поле показывает то, что уйдёт', () => {
    expect(toLocalPhoneDigits('601234567890')).toBe('60123456')
  })

  it('идемпотентна: повторный разбор уже разобранного ничего не меняет', () => {
    for (const [typed] of SAME_NUMBER) {
      const once = toLocalPhoneDigits(typed)
      expect(toLocalPhoneDigits(once)).toBe(once)
    }
  })

  it('форматирование поля не зависит от того, как номер вставили', () => {
    for (const [typed] of SAME_NUMBER) {
      expect(formatLocalPhone(toLocalPhoneDigits(typed))).toBe('60 123 456')
    }
  })
})

describe('сервер: normalizePhone + PHONE_PATTERN', () => {
  it.each(SAME_NUMBER)('%s (%s) → +37360123456, проходит проверку', (typed) => {
    expect(normalizePhone(typed)).toBe('+37360123456')
    expect(PHONE_PATTERN.test(normalizePhone(typed))).toBe(true)
    expect(isValidPhone(typed)).toBe(true)
  })

  it.each([
    ['601234567890', 'двенадцать цифр'],
    ['37360123456789', 'код страны и одиннадцать цифр'],
    ['0060123456789', 'префикс набора и лишние цифры'],
    ['6012345', 'семь цифр'],
    ['', 'пусто'],
    ['abcdef', 'вообще не цифры'],
    ['+1 555 0100 99', 'чужая страна'],
  ])('«%s» (%s) проверку НЕ проходит', (typed) => {
    expect(PHONE_PATTERN.test(normalizePhone(typed))).toBe(false)
    expect(isValidPhone(typed)).toBe(false)
  })

  it('сервер НЕ обрезает длину: лишние цифры валят проверку, а не сочиняют номер', () => {
    // Главное отличие от поля ввода. Обрезка здесь означала бы, что
    // `373601234567890` принимается как `+37360123456` — сервер сам придумал
    // бы правдоподобный номер из заведомо неверного ввода.
    expect(normalizePhone('373601234567890')).toBe('+373601234567890')
    expect(PHONE_PATTERN.test(normalizePhone('373601234567890'))).toBe(false)
  })

  it('первая цифра номера не проверяется (диапазоны операторов меняются)', () => {
    for (const first of '0123456789') {
      expect(PHONE_PATTERN.test(`+373${first}1234567`)).toBe(true)
    }
  })

  it('ровно восемь цифр: семь и девять отвергаются', () => {
    expect(PHONE_PATTERN.test('+3736012345')).toBe(false)
    expect(PHONE_PATTERN.test('+373601234567')).toBe(false)
    expect(PHONE_PATTERN.test('+37360123456')).toBe(true)
  })

  it('идемпотентна на сохранённых номерах — сверка промокодов не ломается', () => {
    // Сверка сравнивает normalizePhone(сохранённый) с normalizePhone(введённым).
    for (const stored of ['+37360123456', '+37306012345', '+37337360123', '+37373012345']) {
      expect(normalizePhone(stored)).toBe(stored)
      expect(normalizePhone(normalizePhone(stored))).toBe(stored)
    }
  })

  it('номер, записанный старым разбором, по-прежнему сверяется сам с собой', () => {
    // `+37337360123` — след прежнего бага (вставка полного номера в поле).
    // Такие значения уже лежат в базе; ломать их сверку нельзя.
    const legacy = '+37337360123'
    expect(normalizePhone(legacy)).toBe(normalizePhone(legacy))
    expect(PHONE_PATTERN.test(normalizePhone(legacy))).toBe(true)
  })
})

describe('поле и сервер согласованы', () => {
  it('то, что собрало поле, сервер принимает без изменений', () => {
    for (const [typed] of SAME_NUMBER) {
      const sentByField = `+373${toLocalPhoneDigits(typed)}`
      expect(PHONE_PATTERN.test(sentByField)).toBe(true)
      expect(normalizePhone(sentByField)).toBe(sentByField)
    }
  })
})

describe('stripPhonePrefixes — общая основа обеих ролей', () => {
  it('снимает смешанные префиксы за один проход', () => {
    expect(stripPhonePrefixes('0 0373 60 123 456')).toBe('60123456')
    expect(stripPhonePrefixes('0 373 60 123 456')).toBe('60123456')
  })

  it('останавливается на нераспознанном остатке, а не грызёт строку дальше', () => {
    expect(stripPhonePrefixes('99999999999')).toBe('99999999999')
  })
})
