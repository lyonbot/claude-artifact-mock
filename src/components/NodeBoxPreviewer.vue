<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { loadSandpackClient, type SandpackClient } from '@codesandbox/sandpack-client'

const iframe = ref<HTMLIFrameElement>()
const iframeRuntime = ref<HTMLIFrameElement>()

let runtime: SandpackClient | undefined

onMounted(async () => {
  runtime = await loadSandpackClient(iframe.value!, {
    files: {
      '/index.js': {
        code: `console.log(require('uuid').v4())`
      }
    },
    entry: '/index.js',
    dependencies: {
      uuid: 'latest'
    }
  })
})

onBeforeUnmount(() => {
  runtime?.destroy()
})
</script>

<template>
  <div>
    <iframe ref="iframe" class="w-80vw h-40vh"></iframe>
  </div>
</template>
