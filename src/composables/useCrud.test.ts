import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useCrud } from '../composables/useCrud'

describe('useCrud', () => {
  it('应初始化为关闭状态', () => {
    const { visible, editingId, saving } = useCrud({ name: '' }, {})
    expect(visible.value).toBe(false)
    expect(editingId.value).toBeNull()
    expect(saving.value).toBe(false)
  })

  it('openCreate 应重置表单并打开对话框', () => {
    const { form, visible, editingId, openCreate } = useCrud(
      { name: 'default' },
      {},
    )
    form.name = 'modified'
    openCreate()
    expect(visible.value).toBe(true)
    expect(editingId.value).toBeNull()
    expect(form.name).toBe('default')
  })

  it('openEdit 应填充表单数据', () => {
    const { form, visible, editingId, openEdit } = useCrud(
      { name: '', email: '' },
      {},
    )
    openEdit(42, { name: 'Alice', email: 'alice@test.com' })
    expect(visible.value).toBe(true)
    expect(editingId.value).toBe(42)
    expect(form.name).toBe('Alice')
    expect(form.email).toBe('alice@test.com')
  })

  it('submit 应在创建模式调用 onCreate', async () => {
    const onCreate = vi.fn().mockResolvedValue({})
    const onSuccess = vi.fn()
    const { form, openCreate, submit } = useCrud(
      { name: '' },
      { onCreate, onSuccess },
    )
    openCreate()
    form.name = 'New Item'
    await submit()
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ name: 'New Item' }))
    expect(onSuccess).toHaveBeenCalled()
  })

  it('submit 应在编辑模式调用 onUpdate', async () => {
    const onUpdate = vi.fn().mockResolvedValue({})
    const { openEdit, submit } = useCrud(
      { name: '' },
      { onUpdate },
    )
    openEdit(10, { name: 'Old' })
    await submit()
    expect(onUpdate).toHaveBeenCalledWith(10, expect.objectContaining({ name: 'Old' }))
  })
})
