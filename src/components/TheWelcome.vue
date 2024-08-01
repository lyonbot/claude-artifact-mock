<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { aggregateOpenAIDeltas, invokeLLMStream, type AggregatedLLMChunk } from '@/utils/invokeLLM'

const chunks = ref<AggregatedLLMChunk[]>([])
const currentChunk = ref<AggregatedLLMChunk | null>(null)

onMounted(async () => {
  const stream = invokeLLMStream({
    model: 'gpt-4o',
    // model: 'claude-3-5-sonnet-20240620',
    messages: [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Shanghai and shenzhen, which is hotter' },
      {
        role: 'assistant',
        content: [{ type: 'text', text: '' }],
        tool_calls: [
          {
            id: 'call_PHpb2CFFgc7m7eurSQBUuHtm',
            type: 'function',
            function: {
              name: 'get_weather',
              arguments: '{"location":"Shanghai","unit":"Celsius"}'
            }
          }
        ]
      },
      {
        role: 'tool',
        tool_call_id: 'call_PHpb2CFFgc7m7eurSQBUuHtm',
        content: '{"temperature":31,"weather":"rainy"}'
      }
    ],
    tools: [
      // Claude 格式
      // {
      //   name: 'get_weather',
      //   description: 'Get the current weather in a given location',
      //   input_schema: {
      //     type: 'object',
      //     properties: {
      //       location: {
      //         type: 'string',
      //         description: 'The city and state, e.g. San Francisco, CA'
      //       }
      //     },
      //     required: ['location']
      //   }
      // }

      // OpenAI 格式
      {
        type: 'function',
        function: {
          name: 'getCurrentTemperature',
          description: 'Get the current temperature for a specific location',
          parameters: {
            type: 'object',
            properties: {
              location: {
                type: 'string',
                description: 'The city and state, e.g., San Francisco, CA'
              },
              unit: {
                type: 'string',
                enum: ['Celsius', 'Fahrenheit'],
                description: "The temperature unit to use. Infer this from the user's location."
              }
            },
            required: ['location', 'unit']
          }
        }
      }
    ]
  })

  for await (const chunk of aggregateOpenAIDeltas(stream)) {
    if (chunk.done) {
      chunks.value.push(chunk)
      currentChunk.value = null
    } else {
      currentChunk.value = chunk
    }
  }
})
</script>

<template>
  <div>
    <NodeBoxPreviewer />

    <pre :key="chunk.id" v-for="chunk in chunks" class="bg-green-3 my-2 whitespace-pre-wrap">
      {{ chunk }}
    </pre>

    <pre v-if="currentChunk" class="bg-blue my-2 whitespace-pre-wrap">
      {{ currentChunk }}
    </pre>
  </div>
</template>
