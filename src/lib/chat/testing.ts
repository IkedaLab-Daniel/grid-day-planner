import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { AIMessage, type BaseMessage } from '@langchain/core/messages'
import type { ChatResult } from '@langchain/core/outputs'

/**
 * Test double for the chat model: replays scripted AI messages in order and records
 * every message list it was called with. With `repeatLast` the final step repeats forever.
 */
export class ScriptedChatModel extends BaseChatModel {
  readonly calls: BaseMessage[][] = []
  /** The options the graph passed to bindTools (e.g. parallel_tool_calls). */
  bindOptions: Record<string, unknown> | undefined
  private index = 0

  constructor(
    private readonly steps: AIMessage[],
    private readonly opts: { repeatLast?: boolean } = {},
  ) {
    super({})
  }

  _llmType() {
    return 'scripted'
  }

  bindTools(_tools?: unknown, options?: Record<string, unknown>) {
    this.bindOptions = options
    return this
  }

  async _generate(messages: BaseMessage[]): Promise<ChatResult> {
    this.calls.push(messages)
    const i = this.opts.repeatLast ? Math.min(this.index, this.steps.length - 1) : this.index
    const step = this.steps[i]
    const repeat = i !== this.index
    const n = this.index++
    if (!step) throw new Error('scripted model has no more steps')
    // Fresh message every call: LangGraph's reducer replaces messages that share an id.
    const message = new AIMessage({
      content: step.content,
      tool_calls: (step.tool_calls ?? []).map((c) => ({ ...c, id: repeat ? `${c.id}-${n}` : c.id })),
    })
    const text = typeof message.content === 'string' ? message.content : ''
    return { generations: [{ text, message }] }
  }
}

export function scriptedModel(steps: AIMessage[], opts?: { repeatLast?: boolean }): ScriptedChatModel {
  return new ScriptedChatModel(steps, opts)
}
