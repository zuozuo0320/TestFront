<script setup lang="ts">
/**
 * 批量创建标签面板
 *
 * 提供批量输入框，用户可以用逗号或空格分隔多个标签名，
 * 系统自动预览待创建的标签数量，并支持自动分配互斥颜色。
 * 通过 v-model 双向绑定 batchInput 和 batchAutoColor。
 */
defineProps<{
  batchInput: string // 批量输入框内容（v-model）
  batchAutoColor: boolean // 是否自动分配互斥色（v-model）
  batchPreviewNames: string[] // 拆分后的标签名预览列表
  saving: boolean // 提交中标志（禁用按钮防重复）
}>()

const emit = defineEmits<{
  'update:batchInput': [value: string] // 更新批量输入内容
  'update:batchAutoColor': [value: boolean] // 更新自动配色开关
  batchCreate: [] // 触发批量创建
}>()
</script>

<template>
  <div class="tm-glass-panel">
    <div class="tm-panel-header">
      <div class="tm-panel-icon">
        <span class="material-symbols-outlined">auto_fix_high</span>
      </div>
      <h3 class="tm-panel-title">批量创建标签</h3>
    </div>
    <p class="tm-panel-desc">
      输入多个标签名（使用空格或逗号分隔），系统将自动为您分配高辨识度的互斥色。
    </p>
    <textarea
      :value="batchInput"
      class="tm-batch-textarea"
      placeholder="例如: 冒烟测试, UI优化, 遗留问题, v2.1.0"
      rows="4"
      @input="emit('update:batchInput', ($event.target as HTMLTextAreaElement).value)"
    ></textarea>
    <p v-if="batchPreviewNames.length > 0" class="tm-batch-preview">
      即将创建
      <strong>{{ batchPreviewNames.length }}</strong>
      个标签：{{ batchPreviewNames.slice(0, 5).join('、')
      }}{{ batchPreviewNames.length > 5 ? ' ...' : '' }}
    </p>
    <div class="tm-batch-footer">
      <label class="tm-batch-checkbox">
        <input
          :checked="batchAutoColor"
          type="checkbox"
          @change="emit('update:batchAutoColor', ($event.target as HTMLInputElement).checked)"
        />
        <span>自动分配互斥色</span>
      </label>
      <button
        type="button"
        class="um-add-btn tm-batch-submit"
        :disabled="saving"
        @click="emit('batchCreate')"
      >
        执行创建
      </button>
    </div>
  </div>
</template>

<style scoped>
.tm-glass-panel {
  background: var(--glass-bg);
  backdrop-filter: blur(12px);
  padding: 24px;
  border-radius: 16px;
  border: 1px solid var(--border-subtle);
}
.tm-panel-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}
.tm-panel-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: var(--purple-20);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--purple-light);
}
.tm-panel-icon .material-symbols-outlined {
  font-size: 18px;
}
.tm-panel-title {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
  letter-spacing: -0.02em;
}
.tm-panel-desc {
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 300;
  line-height: 1.6;
  margin: 0 0 16px;
}
.tm-batch-textarea {
  width: 100%;
  background: var(--bg-input);
  border: 1px solid var(--border-20);
  border-radius: 12px;
  padding: 14px;
  font-size: 13px;
  color: var(--text-primary);
  resize: vertical;
  font-family: inherit;
  outline: none;
  transition: border-color 0.2s;
  box-sizing: border-box;
}
.tm-batch-textarea::placeholder {
  color: var(--text-muted-40);
}
.tm-batch-textarea:focus {
  border-color: var(--purple-50);
}
.tm-batch-preview {
  font-size: 12px;
  color: var(--purple-light);
  margin: 8px 0 0;
}
.tm-batch-preview strong {
  font-weight: 700;
}
.tm-batch-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 16px;
}
.tm-batch-checkbox {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 11px;
  color: var(--text-secondary);
}
.tm-batch-checkbox:hover {
  color: var(--text-primary);
}
.tm-batch-checkbox input[type='checkbox'] {
  width: 16px;
  height: 16px;
  border-radius: 4px;
  accent-color: var(--purple);
}
.um-add-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 24px;
  margin-left: 0;
  border-radius: 10px;
  border: none;
  background: var(--purple);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}
.um-add-btn:hover {
  filter: brightness(1.15);
}
.um-add-btn:active {
  transform: scale(0.95);
}
.um-add-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
