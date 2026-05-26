<script setup lang="ts">
/**
 * 需求文档列表子组件
 *
 * 提供文档上传、粘贴文本、列表展示、删除功能。
 */
import { ref } from 'vue'
import { useRequirementDocs } from '@/composables/useRequirementGen'

const {
  docs,
  total,
  loading,
  page,
  pageSize,
  keyword,
  parseStatusFilter,
  fetchDocs,
  handleUpload,
  handlePaste,
  handleDelete,
} = useRequirementDocs()

// 上传对话框
const showUploadDialog = ref(false)
const uploadFile = ref<File | null>(null)
const uploadTitle = ref('')
const uploadRemark = ref('')
const uploading = ref(false)

// 粘贴对话框
const showPasteDialog = ref(false)
const pasteTitle = ref('')
const pasteContent = ref('')
const pasteRemark = ref('')

function onFileChange(file: any) {
  uploadFile.value = file.raw
  if (!uploadTitle.value) {
    uploadTitle.value = file.name
  }
}

async function submitUpload() {
  if (!uploadFile.value || !uploadTitle.value) return
  uploading.value = true
  try {
    await handleUpload(uploadFile.value, uploadTitle.value, uploadRemark.value)
    showUploadDialog.value = false
    uploadFile.value = null
    uploadTitle.value = ''
    uploadRemark.value = ''
  } finally {
    uploading.value = false
  }
}

async function submitPaste() {
  if (!pasteTitle.value || !pasteContent.value) return
  await handlePaste(pasteTitle.value, pasteContent.value, pasteRemark.value)
  showPasteDialog.value = false
  pasteTitle.value = ''
  pasteContent.value = ''
  pasteRemark.value = ''
}

function onSearch() {
  page.value = 1
  fetchDocs()
}

function handlePageChange(p: number) {
  page.value = p
  fetchDocs()
}

/** 解析状态显示映射 */
function parseStatusLabel(status: string) {
  const map: Record<string, string> = {
    not_parsed: '待解析',
    parsing: '解析中',
    parsed: '已解析',
    parse_failed: '解析失败',
  }
  return map[status] || status
}

function parseStatusType(status: string) {
  const map: Record<string, string> = {
    not_parsed: 'info',
    parsing: 'warning',
    parsed: 'success',
    parse_failed: 'danger',
  }
  return map[status] || 'info'
}

/** 来源类型 */
function sourceLabel(type: string) {
  return type === 'upload' ? '文件上传' : '粘贴文本'
}
</script>

<template>
  <div class="doc-list-container">
    <!-- 工具栏 -->
    <div class="toolbar">
      <div class="toolbar-left">
        <el-input
          v-model="keyword"
          placeholder="搜索文档标题..."
          clearable
          style="width: 240px"
          @keyup.enter="onSearch"
          @clear="onSearch"
        />
        <el-select
          v-model="parseStatusFilter"
          placeholder="解析状态"
          clearable
          style="width: 140px"
          @change="onSearch"
        >
          <el-option label="待解析" value="not_parsed" />
          <el-option label="解析中" value="parsing" />
          <el-option label="已解析" value="parsed" />
          <el-option label="解析失败" value="parse_failed" />
        </el-select>
      </div>
      <div class="toolbar-right">
        <el-button type="primary" @click="showUploadDialog = true">上传文档</el-button>
        <el-button @click="showPasteDialog = true">粘贴文本</el-button>
      </div>
    </div>

    <!-- 文档列表 -->
    <el-table v-loading="loading" :data="docs" stripe style="width: 100%">
      <el-table-column prop="title" label="标题" min-width="200" show-overflow-tooltip />
      <el-table-column label="来源" width="100">
        <template #default="{ row }">
          {{ sourceLabel(row.source_type) }}
        </template>
      </el-table-column>
      <el-table-column label="格式" width="80" prop="file_format" />
      <el-table-column label="字数" width="80" prop="word_count" />
      <el-table-column label="解析状态" width="110">
        <template #default="{ row }">
          <el-tag :type="parseStatusType(row.parse_status)" size="small">
            {{ parseStatusLabel(row.parse_status) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="创建时间" width="160" prop="created_at">
        <template #default="{ row }">
          {{ row.created_at?.slice(0, 16).replace('T', ' ') }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="80" fixed="right">
        <template #default="{ row }">
          <el-button type="danger" link size="small" @click="handleDelete(row.id)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 分页 -->
    <div v-if="total > pageSize" class="pagination-wrap">
      <el-pagination
        v-model:current-page="page"
        :page-size="pageSize"
        :total="total"
        layout="total, prev, pager, next"
        @current-change="handlePageChange"
      />
    </div>

    <!-- 空状态 -->
    <div v-if="!loading && docs.length === 0" class="empty-state">
      <p>暂无需求文档，请上传文件或粘贴文本</p>
    </div>

    <!-- 上传对话框 -->
    <el-dialog
      v-model="showUploadDialog"
      title="上传需求文档"
      width="540px"
      class="requirement-upload-dialog"
    >
      <el-form class="upload-dialog-form" label-position="top">
        <el-form-item label="需求文件" class="upload-file-form-item">
          <el-upload
            class="upload-doc-uploader"
            :auto-upload="false"
            :disabled="uploading"
            :show-file-list="false"
            accept=".docx,.pdf,.md,.txt"
            @change="onFileChange"
          >
            <div class="upload-select-card">
              <span class="material-symbols-outlined upload-select-icon">upload_file</span>
              <span class="upload-select-main">
                <strong class="upload-select-title" :title="uploadFile?.name || ''">
                  {{ uploadFile ? uploadFile.name : '选择需求文档' }}
                </strong>
                <span class="upload-select-desc">支持 docx、pdf、md、txt 格式，最大 10MB</span>
              </span>
              <span class="upload-select-action">
                {{ uploadFile ? '重新选择' : '选择文件' }}
              </span>
            </div>
          </el-upload>
        </el-form-item>
        <div class="upload-dialog-fields">
          <el-form-item label="标题">
            <el-input
              v-model="uploadTitle"
              class="upload-dialog-input"
              clearable
              placeholder="文档标题（默认使用文件名）"
            />
          </el-form-item>
          <el-form-item label="备注">
            <el-input
              v-model="uploadRemark"
              class="upload-dialog-input"
              clearable
              placeholder="可选备注"
            />
          </el-form-item>
        </div>
      </el-form>
      <template #footer>
        <div class="upload-dialog-footer">
          <el-button @click="showUploadDialog = false">取消</el-button>
          <el-button
            type="primary"
            :disabled="!uploadFile || uploading"
            :loading="uploading"
            @click="submitUpload"
          >
            确定上传
          </el-button>
        </div>
      </template>
    </el-dialog>

    <!-- 粘贴对话框 -->
    <el-dialog v-model="showPasteDialog" title="粘贴需求文本" width="600px">
      <el-form label-width="80px">
        <el-form-item label="标题">
          <el-input v-model="pasteTitle" placeholder="文档标题" />
        </el-form-item>
        <el-form-item label="内容">
          <el-input
            v-model="pasteContent"
            type="textarea"
            :rows="12"
            placeholder="粘贴需求文本内容..."
          />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="pasteRemark" placeholder="可选备注" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showPasteDialog = false">取消</el-button>
        <el-button type="primary" :disabled="!pasteTitle || !pasteContent" @click="submitPaste">
          确定创建
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.doc-list-container {
  min-height: 200px;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  gap: 8px;
}

.toolbar-left {
  display: flex;
  gap: 6px;
  align-items: center;
}

.toolbar-right {
  display: flex;
  gap: 6px;
}

.pagination-wrap {
  margin-top: 10px;
  padding: 8px 0 0;
  display: flex;
  justify-content: flex-end;
  border-top: 1px solid var(--tp-border-subtle, var(--el-border-color-lighter));
}

.empty-state {
  text-align: center;
  padding: 48px 0;
  color: var(--tp-text-muted, var(--el-text-color-secondary));
  font-size: 13px;
}

/* ═══════ Upload Dialog Styles ═══════ */
.requirement-upload-dialog {
  --upload-dialog-panel: #111620;
  --upload-dialog-sunken: #0c1018;
  --upload-dialog-input-bg: #090d13;
  --upload-dialog-input-focus: #0b1018;
  --upload-dialog-text: #e1e2eb;
  --upload-dialog-accent: #b6c4ff;
  --upload-dialog-accent-hover: #ced8ff;
  --upload-dialog-label: rgba(196, 197, 215, 0.68);
  --upload-dialog-muted: rgba(196, 197, 215, 0.58);
  --upload-dialog-placeholder: rgba(196, 197, 215, 0.4);
  --upload-dialog-disabled: rgba(196, 197, 215, 0.38);
  --upload-dialog-border: rgba(182, 196, 255, 0.18);
  --upload-dialog-border-soft: rgba(182, 196, 255, 0.12);
  --upload-dialog-border-strong: rgba(182, 196, 255, 0.58);
  --upload-dialog-soft: rgba(182, 196, 255, 0.08);
  --upload-dialog-soft-hover: rgba(182, 196, 255, 0.1);
  --upload-dialog-ring: rgba(182, 196, 255, 0.1);
}

.requirement-upload-dialog :deep(.el-dialog) {
  overflow: hidden;
  border: 1px solid var(--upload-dialog-border);
  border-radius: 18px;
  background: var(--upload-dialog-panel);
  box-shadow:
    0 28px 80px rgba(0, 0, 0, 0.48),
    inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.requirement-upload-dialog :deep(.el-dialog__header) {
  display: flex;
  align-items: center;
  min-height: 64px;
  margin: 0;
  padding: 0 24px;
  border-bottom: 1px solid var(--upload-dialog-border-soft);
}

.requirement-upload-dialog :deep(.el-dialog__title) {
  color: var(--upload-dialog-text);
  font-size: 17px;
  font-weight: 700;
  letter-spacing: 0.01em;
}

.requirement-upload-dialog :deep(.el-dialog__headerbtn) {
  top: 16px;
  right: 18px;
  width: 32px;
  height: 32px;
  border-radius: 10px;
  transition:
    background 0.18s ease,
    color 0.18s ease;
}

.requirement-upload-dialog :deep(.el-dialog__headerbtn:hover) {
  background: var(--upload-dialog-soft);
}

.requirement-upload-dialog :deep(.el-dialog__close) {
  color: color-mix(in srgb, var(--upload-dialog-text) 72%, transparent);
}

.requirement-upload-dialog :deep(.el-dialog__body) {
  padding: 22px 24px 18px;
}

.requirement-upload-dialog :deep(.el-dialog__footer) {
  padding: 16px 24px 22px;
  border-top: 1px solid var(--upload-dialog-border-soft);
}

.upload-dialog-form {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.upload-dialog-form :deep(.el-form-item) {
  margin-bottom: 0;
}

.upload-dialog-form :deep(.el-form-item__label) {
  margin-bottom: 8px;
  color: var(--upload-dialog-label);
  font-size: 13px;
  font-weight: 700;
  line-height: 1.2;
}

.upload-doc-uploader {
  width: 100%;
}

.upload-doc-uploader :deep(.el-upload) {
  width: 100%;
  outline: none;
}

.upload-file-form-item {
  margin-bottom: 2px;
}

.upload-select-card {
  display: flex;
  align-items: center;
  min-height: 82px;
  padding: 16px;
  gap: 14px;
  border: 1px dashed color-mix(in srgb, var(--upload-dialog-accent) 28%, transparent);
  border-radius: 16px;
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--upload-dialog-accent) 5.5%, transparent),
      color-mix(in srgb, var(--upload-dialog-accent) 1.8%, transparent)
    ),
    var(--upload-dialog-sunken);
  cursor: pointer;
  transition:
    border-color 0.18s ease,
    background 0.18s ease,
    box-shadow 0.18s ease;
}

.upload-select-card:hover {
  border-color: color-mix(in srgb, var(--upload-dialog-accent) 50%, transparent);
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--upload-dialog-accent) 9%, transparent),
      color-mix(in srgb, var(--upload-dialog-accent) 2.6%, transparent)
    ),
    var(--upload-dialog-sunken);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--upload-dialog-accent) 5%, transparent);
}

.upload-doc-uploader :deep(.el-upload:focus-visible) .upload-select-card {
  border-color: color-mix(in srgb, var(--upload-dialog-accent) 72%, transparent);
  box-shadow: 0 0 0 3px var(--upload-dialog-border-soft);
}

.upload-select-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  flex-shrink: 0;
  border: 1px solid var(--upload-dialog-border);
  border-radius: 13px;
  background: var(--upload-dialog-soft);
  color: var(--upload-dialog-accent);
  font-size: 22px;
  line-height: 1;
}

.upload-select-main {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 5px;
  text-align: left;
}

.upload-select-title {
  overflow: hidden;
  color: var(--upload-dialog-text);
  font-size: 14px;
  font-weight: 700;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.upload-select-desc {
  color: var(--upload-dialog-muted);
  font-size: 12px;
  line-height: 1.4;
}

.upload-select-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 76px;
  height: 32px;
  flex-shrink: 0;
  border: 1px solid var(--upload-dialog-border);
  border-radius: 10px;
  background: var(--upload-dialog-soft);
  color: var(--upload-dialog-accent);
  font-size: 12px;
  font-weight: 700;
}

.upload-dialog-fields {
  display: grid;
  grid-template-columns: 1fr;
  gap: 14px;
}

.upload-dialog-input :deep(.el-input__wrapper) {
  min-height: 42px;
  border: 1px solid color-mix(in srgb, var(--upload-dialog-accent) 14%, transparent);
  border-radius: 13px;
  background: var(--upload-dialog-input-bg);
  box-shadow: none;
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    background 0.18s ease;
}

.upload-dialog-input :deep(.el-input__wrapper.is-focus) {
  border-color: var(--upload-dialog-border-strong);
  background: var(--upload-dialog-input-focus);
  box-shadow: 0 0 0 3px var(--upload-dialog-ring);
}

.upload-dialog-input :deep(.el-input__inner) {
  color: var(--upload-dialog-text);
  font-size: 13px;
}

.upload-dialog-input :deep(.el-input__inner::placeholder) {
  color: var(--upload-dialog-placeholder);
}

.upload-dialog-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}

.requirement-upload-dialog :deep(.el-button) {
  min-height: 36px;
  padding: 0 16px;
  border-radius: 11px;
  font-size: 13px;
  font-weight: 700;
}

.requirement-upload-dialog :deep(.el-button:not(.el-button--primary)) {
  border-color: color-mix(in srgb, var(--upload-dialog-accent) 14%, transparent);
  background: color-mix(in srgb, var(--upload-dialog-accent) 6%, transparent);
  color: color-mix(in srgb, var(--upload-dialog-text) 82%, transparent);
}

.requirement-upload-dialog :deep(.el-button:not(.el-button--primary):hover) {
  border-color: color-mix(in srgb, var(--upload-dialog-accent) 30%, transparent);
  background: var(--upload-dialog-soft-hover);
  color: var(--upload-dialog-text);
}

.requirement-upload-dialog :deep(.el-button--primary) {
  border-color: color-mix(in srgb, var(--upload-dialog-accent) 64%, transparent);
  background: var(--upload-dialog-accent);
  color: var(--upload-dialog-sunken);
  box-shadow: 0 10px 26px var(--upload-dialog-border);
}

.requirement-upload-dialog :deep(.el-button--primary:hover) {
  border-color: color-mix(in srgb, var(--upload-dialog-accent-hover) 82%, transparent);
  background: var(--upload-dialog-accent-hover);
  color: var(--upload-dialog-sunken);
}

.requirement-upload-dialog :deep(.el-button.is-disabled),
.requirement-upload-dialog :deep(.el-button.is-disabled:hover) {
  border-color: var(--upload-dialog-border-soft);
  background: var(--upload-dialog-soft);
  color: var(--upload-dialog-disabled);
  box-shadow: none;
}

.requirement-upload-dialog {
  --upload-dialog-panel: #111722;
  --upload-dialog-sunken: #0b1018;
  --upload-dialog-input-bg: rgba(7, 10, 16, 0.82);
  --upload-dialog-input-focus: rgba(10, 15, 24, 0.96);
  --upload-dialog-text: #f1f3fb;
  --upload-dialog-accent: #b6c4ff;
  --upload-dialog-accent-hover: #d0d8ff;
  --upload-dialog-label: rgba(225, 226, 235, 0.72);
  --upload-dialog-muted: rgba(196, 197, 215, 0.68);
  --upload-dialog-placeholder: rgba(196, 197, 215, 0.42);
  --upload-dialog-disabled: rgba(196, 197, 215, 0.36);
  --upload-dialog-border: rgba(182, 196, 255, 0.2);
  --upload-dialog-border-soft: rgba(182, 196, 255, 0.12);
  --upload-dialog-border-strong: rgba(182, 196, 255, 0.62);
  --upload-dialog-soft: rgba(182, 196, 255, 0.085);
  --upload-dialog-soft-hover: rgba(182, 196, 255, 0.14);
  --upload-dialog-ring: rgba(182, 196, 255, 0.14);
}

.requirement-upload-dialog :deep(.el-dialog) {
  width: min(540px, calc(100vw - 48px)) !important;
  border-color: rgba(182, 196, 255, 0.22);
  border-radius: 20px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.035), transparent 42%), var(--upload-dialog-panel);
  box-shadow:
    0 28px 72px rgba(0, 0, 0, 0.56),
    0 0 0 1px rgba(255, 255, 255, 0.025) inset;
}

.requirement-upload-dialog :deep(.el-dialog__header) {
  min-height: 60px;
  padding: 0 20px;
}

.requirement-upload-dialog :deep(.el-dialog__title) {
  font-size: 16px;
  letter-spacing: 0;
}

.requirement-upload-dialog :deep(.el-dialog__body) {
  padding: 18px 20px 16px;
}

.requirement-upload-dialog :deep(.el-dialog__footer) {
  padding: 14px 20px 18px;
  background: rgba(8, 12, 18, 0.28);
}

.upload-dialog-form {
  gap: 16px;
}

.upload-dialog-form :deep(.el-form-item__label) {
  margin-bottom: 8px;
  color: var(--upload-dialog-label);
  font-size: 12px;
  font-weight: 700;
}

.upload-doc-uploader {
  display: block;
  width: 100%;
}

.upload-doc-uploader :deep(.el-upload) {
  display: block;
  width: 100%;
}

.upload-select-card {
  display: grid;
  width: 100%;
  min-height: 92px;
  box-sizing: border-box;
  grid-template-columns: 46px minmax(0, 1fr) auto;
  align-items: center;
  padding: 16px 18px;
  gap: 14px;
  border: 1px solid rgba(182, 196, 255, 0.22);
  border-radius: 16px;
  background:
    linear-gradient(135deg, rgba(182, 196, 255, 0.11), rgba(255, 255, 255, 0.018) 54%), #0b1018;
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.04) inset,
    0 14px 34px rgba(0, 0, 0, 0.16);
}

.upload-select-card:hover {
  border-color: rgba(182, 196, 255, 0.52);
  background:
    linear-gradient(135deg, rgba(182, 196, 255, 0.15), rgba(255, 255, 255, 0.026) 54%), #0d1320;
  box-shadow:
    0 0 0 3px rgba(182, 196, 255, 0.06),
    0 16px 36px rgba(0, 0, 0, 0.18);
}

.upload-select-icon {
  width: 46px;
  height: 46px;
  border-color: rgba(182, 196, 255, 0.24);
  border-radius: 15px;
  background: rgba(182, 196, 255, 0.105);
  color: var(--upload-dialog-accent);
  font-size: 23px;
}

.upload-select-main {
  gap: 6px;
}

.upload-select-title {
  color: var(--upload-dialog-text);
  font-size: 14px;
  letter-spacing: 0;
}

.upload-select-desc {
  color: var(--upload-dialog-muted);
  font-size: 12px;
}

.upload-select-action {
  min-width: 82px;
  height: 34px;
  border-color: rgba(182, 196, 255, 0.3);
  border-radius: 11px;
  background: rgba(182, 196, 255, 0.12);
  color: var(--upload-dialog-accent);
}

.upload-dialog-fields {
  gap: 12px;
}

.upload-dialog-input :deep(.el-input__wrapper) {
  min-height: 40px;
  border-color: rgba(182, 196, 255, 0.18);
  border-radius: 12px;
  background: var(--upload-dialog-input-bg);
}

.upload-dialog-input :deep(.el-input__wrapper:hover) {
  border-color: rgba(182, 196, 255, 0.32);
  background: rgba(9, 13, 21, 0.94);
}

.upload-dialog-input :deep(.el-input__wrapper.is-focus) {
  border-color: var(--upload-dialog-border-strong);
  box-shadow: 0 0 0 3px var(--upload-dialog-ring);
}

.upload-dialog-footer {
  gap: 8px;
}

.requirement-upload-dialog :deep(.el-button) {
  height: 36px !important;
  min-height: 36px !important;
  padding: 0 15px !important;
  border-radius: 11px !important;
}

.requirement-upload-dialog :deep(.el-button:not(.el-button--primary)) {
  border-color: rgba(182, 196, 255, 0.16) !important;
  background: rgba(255, 255, 255, 0.045) !important;
  color: rgba(241, 243, 251, 0.78) !important;
  box-shadow: none !important;
}

.requirement-upload-dialog :deep(.el-button:not(.el-button--primary):hover) {
  border-color: rgba(182, 196, 255, 0.32) !important;
  background: rgba(182, 196, 255, 0.09) !important;
  color: var(--upload-dialog-text) !important;
}

.requirement-upload-dialog :deep(.el-button--primary) {
  border-color: rgba(182, 196, 255, 0.75) !important;
  background: linear-gradient(135deg, #c8d2ff 0%, #98aefe 100%) !important;
  color: #070b12 !important;
  box-shadow: 0 12px 28px rgba(154, 174, 254, 0.22) !important;
}

.requirement-upload-dialog :deep(.el-button--primary:hover) {
  border-color: rgba(214, 222, 255, 0.9) !important;
  background: linear-gradient(135deg, #dce3ff 0%, #adbefd 100%) !important;
  color: #070b12 !important;
}

.requirement-upload-dialog :deep(.el-button.is-disabled),
.requirement-upload-dialog :deep(.el-button.is-disabled:hover) {
  border-color: rgba(182, 196, 255, 0.12) !important;
  background: rgba(182, 196, 255, 0.06) !important;
  color: var(--upload-dialog-disabled) !important;
  box-shadow: none !important;
}
</style>
