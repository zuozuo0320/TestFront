<template>
  <div class="rich-text-editor">
    <div v-if="editor" class="editor-toolbar">
      <button type="button" :class="{ active: editor.isActive('bold') }" @click.prevent="editor.chain().focus().toggleBold().run()" title="加粗">
        <BoldIcon :size="16" />
      </button>
      <button type="button" :class="{ active: editor.isActive('italic') }" @click.prevent="editor.chain().focus().toggleItalic().run()" title="斜体">
        <ItalicIcon :size="16" />
      </button>
      <button type="button" :class="{ active: editor.isActive('underline') }" @click.prevent="editor.chain().focus().toggleUnderline().run()" title="下划线">
        <UnderlineIcon :size="16" />
      </button>
      <span class="toolbar-divider" />
      <button type="button" :class="{ active: editor.isActive('bulletList') }" @click.prevent="editor.chain().focus().toggleBulletList().run()" title="无序列表">
        <ListIcon :size="16" />
      </button>
      <button type="button" :class="{ active: editor.isActive('orderedList') }" @click.prevent="editor.chain().focus().toggleOrderedList().run()" title="有序列表">
        <ListOrderedIcon :size="16" />
      </button>
      <span class="toolbar-divider" />
      <button type="button" @click.prevent="onInsertImage" title="插入图片">
        <ImagePlusIcon :size="16" />
      </button>
      <button type="button" :class="{ active: editor.isActive('link') }" @click.prevent="onToggleLink" title="链接">
        <Link2Icon :size="16" />
      </button>
    </div>
    <editor-content :editor="editor" class="editor-content" />

    <!-- Teleport dialogs to body so they are NOT clipped by el-drawer overflow -->
    <Teleport to="body">
      <!-- Image URL dialog -->
      <div v-if="showImageDialog" class="rte-dialog-overlay" @mousedown.self="showImageDialog = false">
        <div class="rte-dialog" @mousedown.stop>
          <div class="rte-dialog-title">插入图片</div>
          <input ref="imageInput" v-model="imageUrl" class="rte-dialog-input" placeholder="请输入图片 URL" @keyup.enter="confirmImage" />
          <div class="rte-dialog-actions">
            <button type="button" class="rte-btn rte-btn-cancel" @click="showImageDialog = false">取消</button>
            <button type="button" class="rte-btn rte-btn-confirm" @click="confirmImage">确认</button>
          </div>
        </div>
      </div>

      <!-- Link URL dialog -->
      <div v-if="showLinkDialog" class="rte-dialog-overlay" @mousedown.self="showLinkDialog = false">
        <div class="rte-dialog" @mousedown.stop>
          <div class="rte-dialog-title">插入链接</div>
          <input ref="linkInput" v-model="linkUrl" class="rte-dialog-input" placeholder="请输入链接 URL" @keyup.enter="confirmLink" />
          <div class="rte-dialog-actions">
            <button type="button" class="rte-btn rte-btn-cancel" @click="showLinkDialog = false">取消</button>
            <button type="button" class="rte-btn rte-btn-confirm" @click="confirmLink">确认</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, onBeforeUnmount } from 'vue'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import TiptapImage from '@tiptap/extension-image'
import TiptapLink from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import {
  Bold as BoldIcon,
  Italic as ItalicIcon,
  Underline as UnderlineIcon,
  List as ListIcon,
  ListOrdered as ListOrderedIcon,
  ImagePlus as ImagePlusIcon,
  Link2 as Link2Icon,
} from 'lucide-vue-next'

const props = defineProps<{
  modelValue: string
  placeholder?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

// Dialog state
const showImageDialog = ref(false)
const imageUrl = ref('')
const imageInput = ref<HTMLInputElement | null>(null)
const showLinkDialog = ref(false)
const linkUrl = ref('')
const linkInput = ref<HTMLInputElement | null>(null)

const editor = useEditor({
  content: props.modelValue || '',
  extensions: [
    StarterKit,
    Underline,
    TiptapImage.configure({ inline: true, allowBase64: true }),
    TiptapLink.configure({ openOnClick: false, autolink: true }),
    Placeholder.configure({ placeholder: props.placeholder || '请输入内容...' }),
  ],
  onUpdate: ({ editor: e }) => {
    emit('update:modelValue', e.getHTML())
  },
  editorProps: {
    handlePaste: (_view, event) => {
      const items = event.clipboardData?.items
      if (!items) return false
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          event.preventDefault()
          const file = item.getAsFile()
          if (file) {
            const reader = new FileReader()
            reader.onload = (e) => {
              const src = e.target?.result as string
              editor.value?.chain().focus().setImage({ src }).run()
            }
            reader.readAsDataURL(file)
          }
          return true
        }
      }
      return false
    },
    handleDrop: (view, event, _slice, moved) => {
      // Handle drag and drop images directly into the editor
      if (!moved && event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files.length > 0) {
        const file = event.dataTransfer.files[0]
        if (file && file.type.startsWith('image/')) {
          event.preventDefault()
          const reader = new FileReader()
          reader.onload = (e) => {
            const src = e.target?.result as string
            const coordinates = view.posAtCoords({ left: event.clientX, top: event.clientY })
            if (coordinates) {
              editor.value?.chain().focus().insertContentAt(coordinates.pos, {
                type: 'image',
                attrs: { src },
              }).run()
            }
          }
          reader.readAsDataURL(file)
          return true
        }
      }
      return false
    },
  },
})

watch(() => props.modelValue, (val) => {
  if (editor.value && editor.value.getHTML() !== val) {
    editor.value.commands.setContent(val || '', { emitUpdate: false })
  }
})

onBeforeUnmount(() => {
  editor.value?.destroy()
})

function onInsertImage() {
  imageUrl.value = ''
  showImageDialog.value = true
  nextTick(() => imageInput.value?.focus())
}

function confirmImage() {
  const url = imageUrl.value.trim()
  if (url) {
    editor.value?.chain().focus().setImage({ src: url }).run()
  }
  showImageDialog.value = false
}

function onToggleLink() {
  if (editor.value?.isActive('link')) {
    editor.value.chain().focus().unsetLink().run()
    return
  }
  linkUrl.value = ''
  showLinkDialog.value = true
  nextTick(() => linkInput.value?.focus())
}

function confirmLink() {
  const url = linkUrl.value.trim()
  if (url) {
    editor.value?.chain().focus().setLink({ href: url }).run()
  }
  showLinkDialog.value = false
}
</script>

<style scoped>
.rich-text-editor {
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.03);
}

.editor-toolbar {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 6px 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.02);
}

.editor-toolbar button {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 13px;
  transition: all 0.2s;
}

.editor-toolbar button:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}

.editor-toolbar button.active {
  background: rgba(124, 77, 255, 0.2);
  color: #b388ff;
}

.toolbar-divider {
  width: 1px;
  height: 18px;
  background: rgba(255, 255, 255, 0.1);
  margin: 0 4px;
}

.editor-content {
  min-height: 120px;
  max-height: 300px;
  overflow-y: auto;
  padding: 12px;
}

.editor-content :deep(.tiptap) {
  outline: none;
  color: rgba(255, 255, 255, 0.85);
  font-size: 14px;
  line-height: 1.6;
}

.editor-content :deep(.tiptap p) {
  margin: 0 0 8px;
}

.editor-content :deep(.tiptap p.is-editor-empty:first-child::before) {
  content: attr(data-placeholder);
  float: left;
  color: rgba(255, 255, 255, 0.25);
  pointer-events: none;
  height: 0;
}

.editor-content :deep(.tiptap img) {
  max-width: 100%;
  border-radius: 4px;
}

.editor-content :deep(.tiptap a) {
  color: #b388ff;
  text-decoration: underline;
}

.editor-content :deep(.tiptap ul),
.editor-content :deep(.tiptap ol) {
  padding-left: 24px;
}
</style>

<!-- Global styles for teleported dialogs (not scoped) -->
<style>
.rte-dialog-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 99999;
  display: flex;
  align-items: center;
  justify-content: center;
}
.rte-dialog {
  background: #1e1e2e;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  padding: 20px;
  width: 400px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}
.rte-dialog-title {
  font-size: 15px;
  font-weight: 600;
  color: #fff;
  margin-bottom: 12px;
}
.rte-dialog-input {
  width: 100%;
  padding: 8px 12px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(255, 255, 255, 0.05);
  color: #fff;
  font-size: 14px;
  outline: none;
  box-sizing: border-box;
}
.rte-dialog-input:focus {
  border-color: #7c4dff;
}
.rte-dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}
.rte-btn {
  padding: 6px 16px;
  border-radius: 6px;
  border: none;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}
.rte-btn-cancel {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.7);
}
.rte-btn-cancel:hover {
  background: rgba(255, 255, 255, 0.15);
}
.rte-btn-confirm {
  background: #7c4dff;
  color: #fff;
}
.rte-btn-confirm:hover {
  background: #651fff;
}
</style>
