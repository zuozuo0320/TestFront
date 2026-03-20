<template>
  <div class="file-uploader">
    <div class="upload-area" @click="triggerUpload" @dragover.prevent @drop.prevent="handleDrop">
      <input ref="fileInput" type="file" multiple :accept="accept" style="display:none" @change="handleFileChange" />
      <div class="upload-icon"><UploadCloudIcon :size="28" /></div>
      <div class="upload-text">点击或拖拽文件到此处上传</div>
      <div class="upload-hint">单文件 ≤{{ maxSizeMB }}MB</div>
    </div>
    <div v-if="files.length > 0" class="file-list">
      <div v-for="(file, idx) in files" :key="file.id || idx" class="file-item">
        <component :is="getFileIcon(file.file_name || file.name)" :size="16" class="file-icon-svg" />
        <span class="file-name">{{ file.file_name || file.name }}</span>
        <span class="file-size">{{ formatSize(file.file_size || file.size) }}</span>
        <button
          v-if="file.id && projectId"
          type="button"
          class="file-download"
          title="下载"
          @click.stop="downloadFile(file)"
        ><DownloadIcon :size="14" /></button>
        <button type="button" class="file-remove" @click="removeFile(idx)" title="删除"><XIcon :size="14" /></button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { apiClient } from '../api/client'
import {
  UploadCloud as UploadCloudIcon,
  Download as DownloadIcon,
  X as XIcon,
  FileText,
  FileSpreadsheet,
  FileImage,
  FileArchive,
  File as FileDefault,
} from 'lucide-vue-next'

const props = withDefaults(defineProps<{
  files: any[]
  projectId?: number
  maxSizeMB?: number
  accept?: string
}>(), {
  maxSizeMB: 10,
  accept: '*',
})

const emit = defineEmits<{
  upload: [file: File]
  remove: [index: number]
}>()

const fileInput = ref<HTMLInputElement | null>(null)

function triggerUpload() {
  fileInput.value?.click()
}

function handleFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files) {
    processFiles(Array.from(input.files))
    input.value = ''
  }
}

function handleDrop(e: DragEvent) {
  if (e.dataTransfer?.files) {
    processFiles(Array.from(e.dataTransfer.files))
  }
}

function processFiles(fileList: File[]) {
  for (const file of fileList) {
    if (file.size > props.maxSizeMB * 1024 * 1024) {
      alert(`文件 "${file.name}" 超过 ${props.maxSizeMB}MB 限制`)
      continue
    }
    emit('upload', file)
  }
}

function removeFile(index: number) {
  emit('remove', index)
}

async function downloadFile(file: any) {
  try {
    const resp = await apiClient.get(
      `/projects/${props.projectId}/attachments/${file.id}/download`,
      { responseType: 'blob' },
    )
    const blob = new Blob([resp.data])
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = file.file_name || file.name || 'download'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  } catch {
    alert('下载失败')
  }
}

function formatSize(bytes: number) {
  if (!bytes) return ''
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function getFileIcon(name: string) {
  if (!name) return FileDefault
  const ext = name.split('.').pop()?.toLowerCase()
  const iconMap: Record<string, any> = {
    pdf: FileText, doc: FileText, docx: FileText,
    xls: FileSpreadsheet, xlsx: FileSpreadsheet, csv: FileSpreadsheet,
    png: FileImage, jpg: FileImage, jpeg: FileImage, gif: FileImage, svg: FileImage,
    zip: FileArchive, rar: FileArchive, '7z': FileArchive,
    txt: FileText, md: FileText,
  }
  return iconMap[ext || ''] || FileDefault
}
</script>

<style scoped>
.file-uploader { width: 100%; }

.upload-area {
  border: 2px dashed rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  padding: 20px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s;
  background: rgba(255, 255, 255, 0.02);
}
.upload-area:hover {
  border-color: rgba(124, 77, 255, 0.4);
  background: rgba(124, 77, 255, 0.05);
}
.upload-icon { margin-bottom: 6px; color: rgba(255, 255, 255, 0.4); }
.upload-text { color: rgba(255, 255, 255, 0.6); font-size: 13px; }
.upload-hint { color: rgba(255, 255, 255, 0.3); font-size: 12px; margin-top: 4px; }
.file-icon-svg { color: var(--tp-primary-light, #a78bfa); flex-shrink: 0; }

.file-list {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.file-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.06);
}
.file-icon { font-size: 16px; }
.file-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: rgba(255, 255, 255, 0.8);
  font-size: 13px;
}
.file-size {
  color: rgba(255, 255, 255, 0.4);
  font-size: 12px;
  white-space: nowrap;
}
.file-download {
  background: none;
  border: none;
  color: #b388ff;
  cursor: pointer;
  font-size: 14px;
  padding: 2px 6px;
  border-radius: 4px;
  transition: all 0.2s;
}
.file-download:hover {
  background: rgba(124, 77, 255, 0.15);
  color: #d1c4e9;
}
.file-remove {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.3);
  cursor: pointer;
  font-size: 14px;
  padding: 2px 6px;
  border-radius: 4px;
  transition: all 0.2s;
}
.file-remove:hover {
  color: #ff5252;
  background: rgba(255, 82, 82, 0.1);
}
</style>
