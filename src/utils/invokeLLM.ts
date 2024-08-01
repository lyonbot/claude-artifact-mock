export type LLMMessage = {
  role: LLMMessageRole
  content: string | LLMMessageContent[] // string format is only valid for 'user' and 'system'
  tool_calls?: LLMMessageToolCall[] // only when role is 'assistant'
  tool_call_id?: string // only when role is 'tool'
}

export type LLMMessageRole = 'user' | 'assistant' | 'system' | 'tool'

export type LLMMessageContent =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

export type LLMMessageToolCall = {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export async function* invokeLLMStream(payload: {
  model?: string
  messages: LLMMessage[]
  temperature?: number
  max_tokens?: number
  [k: string]: any
}): AsyncGenerator<object> {
  const messages = payload.messages.map((m) => {
    const out = { ...m }
    if (typeof out.content === 'string') out.content = [{ type: 'text', text: out.content }]
    return out
  })

  const apiUrl = localStorage.getItem('CHAT_COMPLETIONS_API_URL') || 'https://api.openai.com/v1/chat/completions'
  const apiKey = localStorage.getItem('CHAT_COMPLETIONS_API_KEY')

  if (!apiKey) throw new Error('CHAT_COMPLETIONS_API_KEY is not set')

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      ...payload,
      messages,
      stream: true
    })
  })

  if (response.status !== 200)
    throw new Error(`Failed to invoke LLM: code ${response.status}: ${response.statusText}`)

  const stream = response.body?.pipeThrough(new TextDecoderStream())
  if (!stream) throw new Error('No stream')

  const reader = stream.getReader()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += value

    let i = 0
    let j = 0
    while ((j = buffer.indexOf('\n', i)) !== -1) {
      let line = buffer.slice(i, j).trim()
      if (line.startsWith('data:')) {
        line = line.slice(5).trimStart()
        if (line.startsWith('[DONE]')) break

        try {
          yield JSON.parse(line)
        } catch (e) {
          console.error('parse error', e, line)
        }
      }

      i = j + 1
    }

    if (i > 0) buffer = buffer.slice(i)
  }
  await reader.cancel()
}

function randomId() {
  return Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 15)
}

export type AggregatedLLMChunk =
  | {
    type: 'text'
    id: string
    done: boolean
    text: string
  }
  | {
    type: 'tool_call'
    id: string
    done: boolean
    index: number
    name: string
    arguments: string
  }
  | {
    type: 'finish'
    id: string
    done: boolean // meanless, just to align the structure
    reason: 'end_turn' | 'tool_call' | 'max_tokens' | 'content_filter' | 'unknown'
  }
  | {
    type: 'usage'
    id: string
    done: boolean // meanless, just to align the structure
    usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
  }

export async function* aggregateOpenAIDeltas(
  stream: AsyncGenerator<any>
): AsyncGenerator<AggregatedLLMChunk> {
  let currentChunk: AggregatedLLMChunk | null = null

  for await (const chunk of stream) {
    if (chunk.usage) {
      yield {
        type: 'usage',
        id: randomId(),
        usage: {
          prompt_tokens: chunk.usage.prompt_tokens,
          completion_tokens: chunk.usage.completion_tokens,
          total_tokens: chunk.usage.total_tokens
        },
        done: true
      }
    }

    const finish_reason = chunk?.choices?.[0]?.finish_reason
    if (finish_reason) {
      let reason: (AggregatedLLMChunk & { type: 'finish' })['reason']

      if (finish_reason === 'tool_calls' || finish_reason === 'function_call') reason = 'tool_call'
      else if (finish_reason === 'length') reason = 'max_tokens'
      else if (finish_reason === 'content_filter') reason = 'content_filter'
      else if (finish_reason === 'stop') reason = 'end_turn'
      else reason = 'unknown'

      if (currentChunk) {
        yield { ...currentChunk, done: true }
        currentChunk = null
      }

      yield { type: 'finish', id: randomId(), reason, done: true }
    }

    const delta = chunk?.choices?.[0]?.delta
    if (!delta) continue

    // text
    if (delta.content) {
      if (currentChunk?.type !== 'text') {
        if (currentChunk) yield { ...currentChunk, done: true }
        currentChunk = { type: 'text', id: randomId(), text: '', done: false }
      }
      currentChunk.text += delta.content
      yield { ...currentChunk }
      continue
    }

    // openai format tool_calls
    if ('tool_calls' in delta) {
      const toolCall = delta.tool_calls[0]
      const index = toolCall.index

      if (currentChunk?.type !== 'tool_call' || currentChunk.index !== index) {
        if (currentChunk) yield { ...currentChunk, done: true }
        currentChunk = { type: 'tool_call', id: '', index, name: '', arguments: '', done: false }
      }

      if (toolCall.id) currentChunk.id = toolCall.id
      if (toolCall.function.name) currentChunk.name = toolCall.function.name
      if (toolCall.function.arguments) currentChunk.arguments += toolCall.function.arguments
      yield { ...currentChunk }
    }
  }

  if (currentChunk) yield { ...currentChunk, done: true }
}

export async function* aggregateClaudeDeltas(
  stream: AsyncIterable<any>
): AsyncGenerator<AggregatedLLMChunk> {
  let currentChunk: AggregatedLLMChunk | null = null

  let inputTokens = 0

  for await (const event of stream) {
    switch (event.type) {
      case 'message_start':
        currentChunk = null
        break

      case 'content_block_start':
        if (event.content_block.type === 'text') {
          currentChunk = {
            type: 'text',
            id: randomId(),
            text: '',
            done: false
          }
        } else if (event.content_block.type === 'tool_use') {
          currentChunk = {
            type: 'tool_call',
            id: event.content_block.id,
            index: 0, // Claude doesn't provide an index, so we use 0
            name: event.content_block.name,
            arguments: '',
            done: false
          }
        }
        if (currentChunk) yield { ...currentChunk }
        break

      case 'content_block_delta':
        if (event.delta.type === 'text_delta') {
          if (currentChunk?.type !== 'text') {
            if (currentChunk) yield { ...currentChunk, done: true }
            currentChunk = { type: 'text', id: randomId(), text: '', done: false }
          }
          currentChunk.text += event.delta.text
          yield { ...currentChunk }
        } else if (event.delta.type === 'input_json_delta') {
          if (currentChunk?.type === 'tool_call') {
            currentChunk.arguments += event.delta.partial_json
            yield { ...currentChunk }
          }
        }
        break

      case 'content_block_stop':
        if (currentChunk) yield { ...currentChunk, done: true }
        currentChunk = null
        break

      case 'message_delta':
        if (event.delta.stop_reason) {
          let reason: (AggregatedLLMChunk & { type: 'finish' })['reason']
          if (event.delta.stop_reason === 'tool_use') reason = 'tool_call'
          else if (event.delta.stop_reason === 'max_tokens') reason = 'max_tokens'
          else if (event.delta.stop_reason === 'content_filter') reason = 'content_filter'
          else if (event.delta.stop_reason === 'end_turn') reason = 'end_turn'
          else reason = 'unknown'

          yield { type: 'finish', id: randomId(), reason, done: true }
        }

        if (event.usage) {
          if (event.usage.input_tokens) inputTokens = event.usage.input_tokens // claude outputs the usage as first chunk

          yield {
            type: 'usage',
            id: randomId(),
            usage: {
              prompt_tokens: inputTokens,
              completion_tokens: event.usage.output_tokens,
              total_tokens: inputTokens + event.usage.output_tokens
            },
            done: true
          }
        }
        break
    }
  }

  if (currentChunk) yield { ...currentChunk, done: true }
}
