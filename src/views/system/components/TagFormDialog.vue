<script setup lang="ts">
/**
 * 标签新建/编辑对话框
 *
 * 复用同一个对话框处理新建和编辑两种场景：
 *   - editingId 为 null → 新建模式（标题显示“新建标签”）
 *   - editingId 有值  → 编辑模式（标题显示“编辑标签”）
 *
 * 界面采用双栏高保真布局：
 *   - 左侧：表单配置区（标签名、颜色、描述）
 *   - 右侧：卡片式效果实时预览，随输入实时渲染变化
 */
import { ref, computed } from 'vue'

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

// 绑定隐藏的原生 HTML5 color input，支持点击前缀小圆点唤起原生调色盘
const colorInputRef = ref<HTMLInputElement | null>(null)
function triggerColorPicker() {
  if (colorInputRef.value) {
    colorInputRef.value.click()
  }
}
</script>

<template>
  <el-dialog
    :model-value="visible"
    :title="editingId ? '编辑标签' : '新建标签'"
    width="580px"
    class="tm-dialog"
    @update:model-value="emit('update:visible', $event)"
  >
    <div class="tm-dialog-split">
      <!-- 左栏：表单项 -->
      <div class="tm-dialog-left">
        <el-form label-position="top">
          <!-- 标签名称 -->
          <el-form-item label="标签名称" required>
            <el-input
              :model-value="localForm.name"
              maxlength="50"
              placeholder="2-50 字符"
              @update:model-value="updateField('name', $event)"
            />
          </el-form-item>

          <!-- 标签颜色选择 -->
          <el-form-item label="颜色" required>
            <div class="color-picker-wrapper">
              <!-- 预设颜色色板，使用 2x6 紧凑网格布局 -->
              <div class="color-palette-grid">
                <button
                  v-for="c in presetColors"
                  :key="c"
                  type="button"
                  class="color-swatch"
                  :class="{ active: localForm.color === c }"
                  :style="{ backgroundColor: c }"
                  @click="updateField('color', c)"
                >
                  <span
                    v-if="localForm.color === c"
                    class="color-swatch-check material-symbols-outlined"
                  >
                    check
                  </span>
                </button>
              </div>
              <!-- 自定义色值输入 + 原生取色器小胶囊 -->
              <div class="color-custom-row">
                <el-input
                  :model-value="localForm.color"
                  class="color-input"
                  maxlength="7"
                  placeholder="#RRGGBB"
                  @update:model-value="updateField('color', $event)"
                >
                  <template #prefix>
                    <!-- 点击前缀小圆点，直接唤起隐藏的原生调色盘 -->
                    <div
                      class="color-preview-trigger"
                      title="点击打开调色盘"
                      @click="triggerColorPicker"
                    >
                      <div
                        class="color-preview-dot"
                        :style="{ backgroundColor: localForm.color }"
                      ></div>
                      <input
                        ref="colorInputRef"
                        type="color"
                        :value="
                          localForm.color.startsWith('#') && localForm.color.length === 7
                            ? localForm.color
                            : '#3B82F6'
                        "
                        class="hidden-color-picker"
                        @input="updateField('color', ($event.target as HTMLInputElement).value)"
                      />
                    </div>
                  </template>
                </el-input>
              </div>
            </div>
          </el-form-item>

          <!-- 描述 -->
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
      </div>

      <!-- 右栏：实时效果预览（高度还原列表卡片 Bento 风格） -->
      <div class="tm-dialog-right">
        <div class="preview-header">
          <span class="material-symbols-outlined preview-header-icon">visibility</span>
          效果实时预览
        </div>
        <div class="preview-container">
          <div class="tc-card-preview" :style="{ '--accent': localForm.color }">
            <div class="tc-top">
              <div class="tc-left">
                <div class="tc-icon-box">
                  <span
                    class="material-symbols-outlined"
                    style="font-variation-settings: 'FILL' 1; font-size: 16px"
                  >
                    sell
                  </span>
                </div>
                <div class="tc-meta">
                  <h4 class="tc-name">{{ localForm.name || '新标签' }}</h4>
                  <p class="tc-desc">{{ localForm.description || '暂无描述' }}</p>
                </div>
              </div>
            </div>
            <div class="tc-stats">
              <div class="tc-stat">
                <span class="tc-stat-label">关联用例</span>
                <span class="tc-stat-value tc-stat-value--primary">0</span>
              </div>
              <div class="tc-divider"></div>
              <div class="tc-stat">
                <span class="tc-stat-label">创建人</span>
                <span class="tc-stat-value tc-stat-value--creator">Alice Admin</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <template #footer>
      <el-button @click="emit('update:visible', false)">取消</el-button>
      <el-button type="primary" :loading="saving" @click="emit('submit')">确认</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
/* 双栏分割布局 */
.tm-dialog-split {
  display: flex;
  gap: 20px;
  min-height: 280px;
}

.tm-dialog-left {
  flex: 1.1;
  min-width: 0;
}

.tm-dialog-right {
  flex: 0.9;
  min-width: 0;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--tp-border-subtle);
  padding-left: 20px;
  background: radial-gradient(circle at 80% 80%, rgba(99, 102, 241, 0.03), transparent 50%);
}

/* 预览区标题栏 */
.preview-header {
  font-size: 11px;
  color: var(--tp-text-secondary);
  font-weight: 600;
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  gap: 4px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.preview-header-icon {
  font-size: 14px;
  color: var(--tp-accent-primary);
}

.preview-container {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px 0;
}

/* 颜色选择器容器 */
.color-picker-wrapper {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
}

.color-palette-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr); /* 2 行 6 列，完美均衡对齐 */
  gap: 8px;
  width: fit-content;
}

.color-swatch {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  padding: 0;
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.1);
}

.color-swatch:hover {
  transform: scale(1.15);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
}

.color-swatch.active {
  border-color: var(--tp-surface-card);
  box-shadow:
    0 0 0 2.5px var(--tp-accent-primary),
    0 4px 10px rgba(0, 0, 0, 0.15);
  transform: scale(1.05);
}

.color-swatch-check {
  color: #ffffff;
  font-size: 12px;
  font-weight: 900;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5); /* 文字发光阴影确保对比度 */
  user-select: none;
}

.color-custom-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.color-input {
  width: 120px;
}

.color-preview-trigger {
  position: relative;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
}

.color-preview-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 1px solid rgba(0, 0, 0, 0.15);
  box-shadow: inset 0 1px 1px rgba(0, 0, 0, 0.1);
  transition: transform 0.15s;
}

.color-preview-trigger:hover .color-preview-dot {
  transform: scale(1.2);
}

.hidden-color-picker {
  position: absolute;
  opacity: 0;
  width: 100%;
  height: 100%;
  cursor: pointer;
  padding: 0;
  border: none;
}

/* 实时预览卡片（高度还原列表 Bento 风格） */
.tc-card-preview {
  width: 100%;
  background: var(--tp-surface-card);
  border: 1px solid var(--tp-border-subtle);
  border-radius: 12px;
  padding: 16px;
  transition: all 0.3s ease;
  box-shadow: var(--tp-shadow-sm);
  border-left: 2px solid var(--accent) !important; /* 左侧高亮线 */
}

.tc-card-preview:hover {
  background: var(--tp-surface-hover);
  border-color: var(--tp-border-strong);
  box-shadow: var(--tp-shadow-md);
}

.tc-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;
}

.tc-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  width: 100%;
}

.tc-icon-box {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  color: var(--accent);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.25s ease;
}

.tc-meta {
  flex: 1;
  min-width: 0;
}

.tc-name {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--tp-text-primary);
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tc-desc {
  font-size: 11px;
  color: var(--tp-text-muted);
  margin: 2px 0 0;
  font-weight: 300;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tc-stats {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
  border-top: 1px dashed var(--tp-border-subtle);
  padding-top: 12px;
}

.tc-stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.tc-stat-label {
  font-size: 9.5px;
  color: var(--tp-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-weight: 400;
}

.tc-stat-value {
  font-size: 13.5px;
  font-weight: 600;
}

.tc-stat-value--primary {
  color: var(--tp-accent-primary);
}

.tc-stat-value--creator {
  font-size: 11px;
  font-weight: 500;
  color: var(--tp-text-secondary);
}

.tc-divider {
  width: 1px;
  height: 20px;
  background: var(--tp-border-subtle);
  flex-shrink: 0;
}

/* 重写表单样式 */
:deep(.el-input__wrapper),
:deep(.el-textarea__inner) {
  background-color: var(--tp-surface-input) !important;
  box-shadow: 0 0 0 1px var(--tp-border-subtle) inset !important;
  border-radius: 8px !important;
  transition: all 0.2s !important;
}

:deep(.el-input__wrapper):hover,
:deep(.el-textarea__inner):hover {
  box-shadow: 0 0 0 1px var(--tp-border-strong) inset !important;
}

:deep(.el-input__wrapper.is-focus),
:deep(.el-textarea__inner):focus {
  box-shadow:
    0 0 0 1px var(--tp-accent-primary-border) inset,
    0 0 0 3px var(--tp-accent-primary-soft) !important;
  background-color: var(--tp-surface-card) !important;
}
</style>

<style>
/* 针对 el-dialog 的全局样式重写 */
.tm-dialog.el-dialog {
  background: var(--tp-surface-card) !important;
  border: 1px solid var(--tp-border-subtle) !important;
  border-radius: 16px !important;
  box-shadow: var(--tp-shadow-md) !important;
  overflow: hidden;
}

.tm-dialog.el-dialog .el-dialog__header {
  margin: 0 !important;
  padding: 16px 20px 12px !important;
  border-bottom: 1px solid var(--tp-border-subtle) !important;
}

.tm-dialog.el-dialog .el-dialog__title {
  color: var(--tp-text-primary) !important;
  font-size: 15px !important;
  font-weight: 700 !important;
}

.tm-dialog.el-dialog .el-dialog__headerbtn {
  top: 14px !important;
}

.tm-dialog.el-dialog .el-dialog__body {
  padding: 20px 20px 10px !important;
}

.tm-dialog.el-dialog .el-form-item {
  margin-bottom: 18px !important;
}

.tm-dialog.el-dialog .el-form-item__label {
  margin-bottom: 6px !important;
  color: var(--tp-text-secondary) !important;
  font-size: 12px !important;
  font-weight: 600 !important;
}

.tm-dialog.el-dialog .el-dialog__footer {
  padding: 12px 20px 16px !important;
  border-top: 1px solid var(--tp-border-subtle) !important;
  background: transparent !important;
}

/* 对话框内按钮视觉对齐 */
.tm-dialog.el-dialog .el-dialog__footer .el-button {
  min-height: 32px !important;
  height: 32px !important;
  padding: 0 16px !important;
  border-radius: 8px !important;
  font-size: 12px !important;
  font-weight: 600 !important;
}

.tm-dialog.el-dialog .el-dialog__footer .el-button:not(.el-button--primary) {
  border-color: var(--tp-border-subtle) !important;
  background: var(--tp-surface-card) !important;
  color: var(--tp-text-secondary) !important;
}

.tm-dialog.el-dialog .el-dialog__footer .el-button:not(.el-button--primary):hover {
  background: var(--tp-surface-hover) !important;
  color: var(--tp-text-primary) !important;
  border-color: var(--tp-border-strong) !important;
}

.tm-dialog.el-dialog .el-dialog__footer .el-button--primary {
  background: var(--tp-btn-bg) !important;
  border: none !important;
  color: var(--tp-btn-text) !important;
  box-shadow: var(--tp-btn-shadow) !important;
  transition: all 0.2s !important;
}

.tm-dialog.el-dialog .el-dialog__footer .el-button--primary:hover {
  background: var(--tp-btn-bg-hover) !important;
  box-shadow: var(--tp-btn-shadow-hover) !important;
  transform: translateY(-0.5px) !important;
}

.tm-dialog.el-dialog .el-dialog__footer .el-button--primary:active {
  transform: scale(0.98) !important;
}
</style>
