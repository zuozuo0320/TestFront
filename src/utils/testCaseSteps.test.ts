import { describe, expect, it } from 'vitest'
import { parseTestCaseStepsToRows, rowsToTestCaseStepsText } from './testCaseSteps'

describe('parseTestCaseStepsToRows', () => {
  it('将 AI 生成的 JSON 步骤数组拆成可编辑行', () => {
    const rows = parseTestCaseStepsToRows(
      '[{"action":"修改资产台账中该 IP 的运维负责人","expected":"同步接口超时后不产生部分更新"}]',
    )

    expect(rows).toEqual([
      {
        action: '修改资产台账中该 IP 的运维负责人',
        expected: '同步接口超时后不产生部分更新',
      },
    ])
  })

  it('兼容历史的操作与预期文本格式', () => {
    const rows = parseTestCaseStepsToRows('打开页面 | 展示资产台账\n点击同步 | 同步成功')

    expect(rows).toEqual([
      { action: '打开页面', expected: '展示资产台账' },
      { action: '点击同步', expected: '同步成功' },
    ])
  })

  it('兼容单行分号分隔的历史步骤', () => {
    const rows = parseTestCaseStepsToRows('打开页面 | 展示资产台账；点击同步 | 同步成功')

    expect(rows).toEqual([
      { action: '打开页面', expected: '展示资产台账' },
      { action: '点击同步', expected: '同步成功' },
    ])
  })
})

describe('rowsToTestCaseStepsText', () => {
  it('保存时输出平台既有的多行文本格式', () => {
    const text = rowsToTestCaseStepsText([
      { action: '打开页面', expected: '展示资产台账' },
      { action: '点击同步', expected: '同步成功' },
    ])

    expect(text).toBe('打开页面 | 展示资产台账\n点击同步 | 同步成功')
  })
})
