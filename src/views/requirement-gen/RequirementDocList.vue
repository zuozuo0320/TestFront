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
  await handleUpload(uploadFile.value, uploadTitle.value, uploadRemark.value)
  showUploadDialog.value = false
  uploadFile.value = null
  uploadTitle.value = ''
  uploadRemark.value = ''
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
    <el-dialog v-model="showUploadDialog" title="上传需求文档" width="500px">
      <el-form label-width="80px">
        <el-form-item label="文件">
          <el-upload
            :auto-upload="false"
            :limit="1"
            accept=".docx,.pdf,.md,.txt"
            @change="onFileChange"
          >
            <el-button type="primary">选择文件</el-button>
            <template #tip>
              <div class="el-upload__tip">支持 docx、pdf、md、txt 格式，最大 10MB</div>
            </template>
          </el-upload>
        </el-form-item>
        <el-form-item label="标题">
          <el-input v-model="uploadTitle" placeholder="文档标题（默认使用文件名）" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="uploadRemark" placeholder="可选备注" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showUploadDialog = false">取消</el-button>
        <el-button type="primary" :disabled="!uploadFile" @click="submitUpload">确定上传</el-button>
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
</style>
