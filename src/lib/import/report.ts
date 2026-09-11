import { KIND_LABELS } from './detect'
import { list, plural } from './format'
import type { ImportPlan, ImportResult, RowError } from './types'

/** Предупреждения одним списком, не длиннее 20 строк — общий хвост разделов. */
function pushWarnings(lines: string[], errors: RowError[]) {
  for (const error of errors.slice(0, 20)) {
    lines.push(`  ⚠ строка ${error.line}: ${error.message}`)
  }
  if (errors.length > 20) lines.push(`  … и ещё ${errors.length - 20}`)
}

/**
 * Раздел отчёта для скалярного поля товара (страна, категория): счётчик
 * применённых + предупреждения о значениях не из списка и о расхождениях
 * внутри одного handle. Раздел одинаков для всех таких полей — иначе они
 * начинают расходиться по формулировкам и по тому, что вообще показывают.
 */
function pushScalarSection(
  lines: string[],
  label: string,
  stat: ImportPlan['country'] | ImportPlan['productCategory'],
) {
  if (!stat.applied && !stat.unknown.length && !stat.conflicts.length) return
  lines.push(`${label} ${stat.applied}`)
  pushWarnings(lines, stat.unknown)
  pushWarnings(lines, stat.conflicts)
}

/** Человекочитаемый отчёт для CLI — одинаковый для dry-run и боевого прогона. */
export function formatReport(result: ImportResult): string {
  const { plan, errors, dryRun, ok } = result
  const lines: string[] = []

  let formatLine = `Формат файла: ${KIND_LABELS[plan.kind]}`
  if (plan.kind === 'products-a' || plan.kind === 'products-b') {
    formatLine += plan.descriptionLocales.length
      ? ` (описания: ${plan.descriptionLocales.join(', ')})`
      : ' (описание: одна колонка на все языки)'
  }
  lines.push(formatLine)
  lines.push(`Локаль контента: ${plan.locale}`)
  lines.push(dryRun ? 'Режим: DRY-RUN, в базу ничего не пишется' : 'Режим: боевой импорт')
  lines.push('')

  if (errors.length) {
    lines.push(`✘ Ошибок: ${errors.length} — импорт не выполнен (всё-или-ничего)`)
    for (const error of errors.slice(0, 50)) {
      const where = error.line ? `строка ${error.line}` : 'файл'
      lines.push(`  ${where}${error.field ? ` · ${error.field}` : ''}: ${error.message}`)
    }
    if (errors.length > 50) lines.push(`  … и ещё ${errors.length - 50}`)
    return lines.join('\n')
  }

  lines.push(ok ? '✔ Проверка пройдена' : '✘ Импорт не выполнен')
  lines.push(
    `Товаров создать: ${plan.create.length}${plan.create.length ? ` — ${list(plan.create)}` : ''}`,
  )
  lines.push(
    `Товаров обновить: ${plan.update.length}${plan.update.length ? ` — ${list(plan.update)}` : ''}`,
  )
  lines.push(`Вариантов: создано ${plan.variants.created} · обновлено ${plan.variants.updated}`)

  if (plan.variants.invalidVolume.length) {
    lines.push(`⚠ Объём не из списка (строка пропущена): ${plan.variants.invalidVolume.length}`)
    for (const bad of plan.variants.invalidVolume.slice(0, 20)) {
      lines.push(`  строка ${bad.line}: ${bad.message}`)
    }
    if (plan.variants.invalidVolume.length > 20) {
      lines.push(`  … и ещё ${plan.variants.invalidVolume.length - 20}`)
    }
  }

  if (plan.images.attached || plan.images.missing.length) {
    lines.push(
      `Фото: привязано ${plan.images.attached}` +
        (plan.images.missing.length ? `, не найдено ${plan.images.missing.length}` : ''),
    )
    for (const miss of plan.images.missing.slice(0, 20)) {
      lines.push(`  строка ${miss.line}: ${miss.message}`)
    }
    if (plan.images.missing.length > 20) lines.push(`  … и ещё ${plan.images.missing.length - 20}`)
  }

  // Фото вариантов — отдельным блоком от общей галереи: у них разный смысл
  // («какой флакон показать при выборе объёма» против «галерея товара»), и
  // ненайденное имя тут диагностируется по handle + объёму, а не по номеру
  // строки в одиночку — так понятно, какой именно вариант остался без фото.
  if (plan.variantImages.attached || plan.variantImages.missing.length) {
    lines.push(
      `Фото вариантов: привязано ${plan.variantImages.attached}` +
        (plan.variantImages.missing.length
          ? `, не найдено ${plan.variantImages.missing.length}`
          : ''),
    )
    for (const miss of plan.variantImages.missing.slice(0, 20)) {
      lines.push(`  строка ${miss.line}: ${miss.message}`)
    }
    if (plan.variantImages.missing.length > 20) {
      lines.push(`  … и ещё ${plan.variantImages.missing.length - 20}`)
    }
  }

  // Поля уровня товара из отдельных колонок (см. lib/import/productScalars.ts):
  // раздел печатается, только если поле в файле вообще участвовало — молчание
  // означает «колонки нет или она пуста», а не «всё проставлено».
  pushScalarSection(lines, 'Страна-производитель: проставлена у', plan.country)
  pushScalarSection(lines, 'Категория товара: проставлена у', plan.productCategory)

  // Логотипы брендов — счёт идёт по БРЕНДАМ, а не по строкам файла: у бренда
  // с 40 товарами ячейка повторяется 40 раз, но запись обновляется один раз.
  // Формулировка «у N брендов» именно поэтому, не «привязано N».
  const logos = plan.brandLogos
  if (logos.applied || logos.missing.length || logos.conflicts.length) {
    lines.push(
      `Логотипы брендов: проставлены у ${logos.applied} ${plural(logos.applied, 'бренда', 'брендов', 'брендов')}`,
    )
    pushWarnings(lines, logos.missing)
    pushWarnings(lines, logos.conflicts)
  }

  const auto = plan.autoCreate
  const autoTotal = auto.brands.length + auto.categories.length + auto.notes.length
  if (autoTotal) {
    lines.push(`Справочники ${dryRun ? 'будут созданы' : 'созданы'} автоматически (${autoTotal}):`)
    if (auto.brands.length) lines.push(`  бренды: ${list(auto.brands)}`)
    if (auto.categories.length) lines.push(`  категории: ${list(auto.categories)}`)
    if (auto.notes.length) lines.push(`  ноты: ${list(auto.notes)}`)
    lines.push('  ⚠ проверьте, нет ли здесь опечаток в slug-ах')
  }

  // Отдельным блоком с пустой строкой до и после — предупреждение не должно
  // теряться между строками статистики: клиенту после такого импорта нужно
  // руками пройтись по переводам.
  if (plan.descriptionDuplicated) {
    lines.push('')
    lines.push(
      `⚠ В файле одна колонка description — этот текст ${dryRun ? 'будет продублирован' : 'продублирован'} на все языки, где описание было пустым (${plan.descriptionDuplicated} шт).`,
    )
    lines.push(
      '  Готовые переводы не тронуты. Дубли нужно перевести вручную в админке — сейчас там один и тот же текст на разных языках.',
    )
    lines.push('')
  }

  if (plan.skipped.length) {
    lines.push(`Пропущено строк: ${plan.skipped.length}`)
    for (const skip of plan.skipped.slice(0, 20)) {
      lines.push(`  строка ${skip.line}: ${skip.message}`)
    }
  }

  return lines.join('\n')
}
