export interface TestCaseStepRow {
  action: string
  expected: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeStepText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeStructuredRows(items: unknown[]): TestCaseStepRow[] {
  return items
    .map((item) => {
      if (typeof item === 'string') {
        return { action: item.trim(), expected: '' }
      }

      if (!isRecord(item)) {
        return { action: '', expected: '' }
      }

      const action = normalizeStepText(item.action ?? item.step ?? item.description)
      const expected = normalizeStepText(item.expected ?? item.expect ?? item.result)
      return { action, expected }
    })
    .filter((row) => row.action || row.expected)
}

function parseStructuredSteps(text: string): TestCaseStepRow[] | null {
  try {
    const parsed: unknown = JSON.parse(text)
    if (Array.isArray(parsed)) {
      return normalizeStructuredRows(parsed)
    }
    if (isRecord(parsed) && Array.isArray(parsed.steps)) {
      return normalizeStructuredRows(parsed.steps)
    }
  } catch {
    return null
  }
  return null
}

/**
 * 将用例步骤反序列化为编辑表格行，兼容 AI 产物 JSON 数组和历史纯文本格式。
 */
export function parseTestCaseStepsToRows(text: string): TestCaseStepRow[] {
  const trimmed = (text || '').trim()
  if (!trimmed) return [{ action: '', expected: '' }]

  const structuredRows = parseStructuredSteps(trimmed)
  if (structuredRows && structuredRows.length > 0) {
    return structuredRows
  }

  let raw = trimmed
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  if (raw.length <= 1) {
    raw = trimmed
      .split(/[;；]+/)
      .map((line) => line.trim())
      .filter(Boolean)
  }

  const result = raw.map((line) => {
    const parts = line.split('|')
    if (parts.length >= 2) {
      return { action: (parts[0] ?? '').trim(), expected: parts.slice(1).join('|').trim() }
    }
    return { action: line, expected: '' }
  })

  return result.length > 0 ? result : [{ action: '', expected: '' }]
}

/**
 * 将步骤编辑表格行序列化为后端既有的多行文本格式，避免保存原始 JSON。
 */
export function rowsToTestCaseStepsText(rows: TestCaseStepRow[]): string {
  return rows
    .map((row) => ({ action: row.action.trim(), expected: row.expected.trim() }))
    .filter((row) => row.action || row.expected)
    .map((row) => `${row.action} | ${row.expected}`)
    .join('\n')
}
