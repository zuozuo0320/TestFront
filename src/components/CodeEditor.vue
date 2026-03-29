<script setup lang="ts">
import { Codemirror } from 'vue-codemirror'
import { javascript } from '@codemirror/lang-javascript'
import { oneDark } from '@codemirror/theme-one-dark'
import { EditorView } from '@codemirror/view'

const props = withDefaults(
  defineProps<{
    modelValue: string
    readonly?: boolean
    minHeight?: string
    maxHeight?: string
  }>(),
  {
    readonly: false,
    minHeight: '200px',
    maxHeight: '500px',
  },
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const extensions = [javascript({ typescript: true }), oneDark, EditorView.lineWrapping]
</script>

<template>
  <Codemirror
    :model-value="props.modelValue"
    :extensions="extensions"
    :disabled="props.readonly"
    :style="{
      minHeight: props.minHeight,
      maxHeight: props.maxHeight,
      overflow: 'auto',
      borderRadius: '8px',
      fontSize: '13px',
    }"
    @update:model-value="(v: string) => emit('update:modelValue', v)"
  />
</template>
