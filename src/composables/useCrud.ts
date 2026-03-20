import { reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'

/**
 * 通用 CRUD 对话框逻辑
 *
 * @param defaultForm - 表单默认值（用于重置）
 * @param options - 提交和成功回调
 *
 * @example
 * const { form, visible, editing, saving, openCreate, openEdit, submit } = useCrud(
 *   { name: '', email: '' },
 *   {
 *     onCreate: (form) => createUser(form),
 *     onUpdate: (id, form) => updateUser(id, form),
 *     onSuccess: () => { loadUsers() },
 *   }
 * )
 */
export function useCrud<T extends Record<string, any>>(
  defaultForm: T,
  options: {
    onCreate?: (form: T) => Promise<any>
    onUpdate?: (id: number, form: T) => Promise<any>
    onSuccess?: () => void | Promise<void>
    successMessage?: string
  },
) {
  const form = reactive<T>({ ...defaultForm }) as T
  const visible = ref(false)
  const editingId = ref<number | null>(null)
  const saving = ref(false)

  const isEditing = () => editingId.value !== null

  function resetForm() {
    Object.assign(form, { ...defaultForm })
  }

  function openCreate() {
    editingId.value = null
    resetForm()
    visible.value = true
  }

  function openEdit(id: number, data: Partial<T>) {
    editingId.value = id
    resetForm()
    Object.assign(form, data)
    visible.value = true
  }

  async function submit() {
    saving.value = true
    try {
      if (isEditing() && options.onUpdate) {
        await options.onUpdate(editingId.value!, form)
      } else if (options.onCreate) {
        await options.onCreate(form)
      }
      visible.value = false
      ElMessage.success(options.successMessage || (isEditing() ? '更新成功' : '创建成功'))
      if (options.onSuccess) await options.onSuccess()
    } catch (e: any) {
      ElMessage.error(e?.response?.data?.error || (isEditing() ? '更新失败' : '创建失败'))
    } finally {
      saving.value = false
    }
  }

  return { form, visible, editingId, saving, isEditing, openCreate, openEdit, submit, resetForm }
}
