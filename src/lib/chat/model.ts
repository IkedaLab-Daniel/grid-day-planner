import { ChatOpenAI } from '@langchain/openai'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'

/** Thrown when the Azure OpenAI settings are incomplete. The message never contains a secret value. */
export class ChatConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ChatConfigError'
  }
}

export function createChatModel(env: Record<string, string | undefined> = process.env): BaseChatModel {
  const need = (name: string): string => {
    const value = env[name]
    if (!value) throw new ChatConfigError(`Missing environment variable ${name}`)
    return value
  }
  const apiKey = need('AZURE_OPENAI_API_KEY')
  const baseURL = need('AZURE_OPENAI_ENDPOINT')
  const model = need('AZURE_OPENAI_DEPLOYMENT')

  return new ChatOpenAI({
    model,
    apiKey,
    temperature: 0.2,
    maxRetries: 1,
    timeout: 30_000,
    configuration: { baseURL, defaultHeaders: { 'api-key': apiKey } },
  })
}
