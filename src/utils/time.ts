const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000

export interface FormatBeijingDateTimeOptions {
  includeSeconds?: boolean
  fallback?: string
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

function normalizeApiTimestamp(value: string): string {
  const trimmed = value.trim()
  const isoLike = trimmed.replace(' ', 'T')
  const hasTimeZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(isoLike)
  return hasTimeZone ? isoLike : `${isoLike}Z`
}

/**
 * 后端 datetime 按 UTC ISO 返回，列表展示统一转成北京时间，避免直接截字符串导致少 8 小时。
 */
export function formatBeijingDateTime(
  value?: string | null,
  options: FormatBeijingDateTimeOptions = {},
): string {
  const fallback = options.fallback ?? '-'
  if (!value?.trim()) return fallback

  const timestamp = Date.parse(normalizeApiTimestamp(value))
  if (Number.isNaN(timestamp)) return fallback

  const date = new Date(timestamp + BEIJING_OFFSET_MS)
  const datePart = [
    date.getUTCFullYear(),
    pad2(date.getUTCMonth() + 1),
    pad2(date.getUTCDate()),
  ].join('-')
  const timePart = [pad2(date.getUTCHours()), pad2(date.getUTCMinutes())]

  if (options.includeSeconds) {
    timePart.push(pad2(date.getUTCSeconds()))
  }

  return `${datePart} ${timePart.join(':')}`
}
