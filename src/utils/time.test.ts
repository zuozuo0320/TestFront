import { describe, expect, it } from 'vitest'
import { formatBeijingDateTime } from './time'

describe('formatBeijingDateTime', () => {
  it('将 UTC ISO 时间转换成北京时间分钟展示', () => {
    expect(formatBeijingDateTime('2026-05-31T15:21:02.410Z')).toBe('2026-05-31 23:21')
  })

  it('跨天时正确进位到北京时间次日', () => {
    expect(formatBeijingDateTime('2026-05-31T16:05:00Z')).toBe('2026-06-01 00:05')
  })

  it('可按需展示秒', () => {
    expect(formatBeijingDateTime('2026-05-31T15:21:02.410Z', { includeSeconds: true })).toBe(
      '2026-05-31 23:21:02',
    )
  })

  it('兼容无时区后缀的接口时间字符串', () => {
    expect(formatBeijingDateTime('2026-05-31 15:21:02')).toBe('2026-05-31 23:21')
  })

  it('空值或非法值返回兜底文案', () => {
    expect(formatBeijingDateTime('')).toBe('-')
    expect(formatBeijingDateTime('bad-date', { fallback: '—' })).toBe('—')
  })
})
