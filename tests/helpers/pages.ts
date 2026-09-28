import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'

const execFileAsync = promisify(execFile)

const TSX_BIN = path.resolve(process.cwd(), 'node_modules/.bin/tsx')
const SCRIPT = path.resolve(process.cwd(), 'tests/helpers/pagesCliScript.ts')

/**
 * Payload логирует предупреждение про почтовый адаптер прямо в stdout —
 * оно оказывается ПЕРЕД JSON-строкой, которую печатает скрипт. Результат —
 * последняя непустая строка вывода, а не весь stdout целиком.
 */
function lastJsonLine<T>(stdout: string): T {
  const lines = stdout.trim().split('\n')
  return JSON.parse(lines.at(-1) ?? '') as T
}

/** Создаёт документ `Pages` отдельным процессом (Local API, не REST). */
export async function createPageViaCli(slug: string, title = slug): Promise<number> {
  const { stdout } = await execFileAsync(TSX_BIN, [SCRIPT, 'create', slug, title])
  return lastJsonLine<{ id: number }>(stdout).id
}

/** Удаляет документ `Pages` по slug отдельным процессом (Local API). */
export async function deletePageViaCli(slug: string): Promise<boolean> {
  const { stdout } = await execFileAsync(TSX_BIN, [SCRIPT, 'delete', slug])
  return lastJsonLine<{ deleted: boolean }>(stdout).deleted
}
