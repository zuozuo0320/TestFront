<script setup lang="ts">
/**
 * 标签新建/编辑对话框
 *
 * 复用同一个对话框处理新建和编辑两种场景：
 *   - editingId 为 null → 新建模式（标题显示“新建标签”）
 *   - editingId 有值  → 编辑模式（标题显示“编辑标签”）
 *
 * 表单字段：标签名称、颜色（色板选择 + 手动输入）、描述
 * 颜色选择器使用圆形色块，选中时显示对号标记
 */
import { computed } from 'vue'

const props = defineProps<{
  visible: boolean // 对话框可见性（v-model）
  editingId: number | null // 编辑模式的标签 ID，null 表示新建
  tagForm: { name: string; color: string; description: string } // 表单数据
  saving: boolean // 提交中标志（显示 loading 状态）
  presetColors: string[] // 预设颜色列表（色板可选项）
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean] // 关闭对话框
  'update:tagForm': [value: { name: string; color: string; description: string }] // 更新表单数据
  submit: [] // 提交表单
}>()

const localForm = computed({
  get: () => props.tagForm,
  set: (val) => emit('update:tagForm', val),
})

function updateField(field: 'name' | 'color' | 'description', value: string) {
  emit('update:tagForm', { ...props.tagForm, [field]: value })
}
</script>

<template>
  <el-dialog
    :model-value="visible"
    :title="editingId ? '编辑标签' : '新建标签'"
    width="480px"
    class="tm-dialog"
    @update:model-value="emit('update:visible', $event)"
  >
    <el-form label-position="top">
      <el-form-item label="标签名称" required>
        <el-input
          :model-value="localForm.name"
          maxlength="50"
          placeholder="2-50 字符"
          @update:model-value="updateField('name', $event)"
        />
      </el-form-item>
      <el-form-item label="颜色" required>
        <div class="color-palette">
          <button
            v-for="c in presetColors"
            :key="c"
            type="button"
            class="color-swatch"
            :class="{ active: localForm.color === c }"
            :style="{ backgroundColor: c }"
            @click="updateField('color', c)"
          >
            <span v-if="localForm.color === c" class="color-swatch-check material-symbols-outlined">
              check
            </span>
          </button>
        </div>
        <el-input
          :model-value="localForm.color"
          class="color-input"
          maxlength="7"
          placeholder="#RRGGBB"
          @update:model-value="updateField('color', $event)"
        />
      </el-form-item>
      <el-form-item label="描述">
        <el-input
          :model-value="localForm.description"
          type="textarea"
          :rows="2"
          maxlength="200"
          placeholder="可选"
          @update:model-value="updateField('description', $event)"
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="emit('update:visible', false)">取消</el-button>
      <el-button type="primary" :loading="saving" @click="emit('submit')">确认</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.color-palette {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.color-swatch {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}
.color-swatch:hover {
  transform: scale(1.15);
}
.color-swatch.active {
  border-color: var(--tp-surface-card);
  box-shadow:
    0 0 0 2px var(--tp-accent-primary-border),
    0 10px 20px rgba(15, 23, 42, 0.12);
}
.color-swatch-check {
  color: var(--tp-surface-card);
  font-size: 16px;
}
.color-input {
  width: 140px;
  margin-top: 8px;
}
</style>
<style>
.tm-dialog .el-dialog {
  background:
    linear-gradient(145deg, rgba(255, 255, 255, 0.96), rgba(248, 250, 252, 0.88)),
    radial-gradient(circle at 10% 0%, rgba(99, 102, 241, 0.12), transparent 38%);
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-radius: 18px;
  box-shadow:
    0 28px 72px rgba(15, 23, 42, 0.18),
    inset 0 1px 0 rgba(255, 255, 255, 0.82);
}
.tm-dialog .el-dialog__header {
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.18);
}
.tm-dialog .el-dialog__title {
  color: var(--tp-gray-900);
  font-size: var(--tp-text-lg);
  font-weight: var(--tp-font-bold);
  line-height: var(--tp-line-tight);
}
.tm-dialog .el-form-item__label {
  color: var(--tp-text-secondary);
  font-size: var(--tp-text-sm);
  font-weight: var(--tp-font-semibold);
}
.tm-dialog .el-dialog__body {
  padding-top: 18px;
}
</style>
