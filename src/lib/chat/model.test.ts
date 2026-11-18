import { describe, test, expect } from 'vitest'
import { ChatConfigError, createChatModel } from '@/lib/chat/model'

const env = {
  AZURE_OPENAI_API_KEY: 'test-key-123',
  AZURE_OPENAI_ENDPOINT: 'https://example.openai.azure.com/openai/v1',
  AZURE_OPENAI_DEPLOYMENT: 'gpt-4.1-mini',
}

describe('createChatModel', () => {
  test('builds a tool-capable model from a complete environment', () => {
    expect(typeof createChatModel(env).bindTools).toBe('function')
  })

  test.each(Object.keys(env))('a missing %s throws ChatConfigError naming it, never the key', (name) => {
    const partial: Record<string, string | undefined> = { ...env, [name]: undefined }
    let error: unknown
    try {
      createChatModel(partial)
    } catch (e) {
      error = e
    }
    expect(error).toBeInstanceOf(ChatConfigError)
    const message = (error as Error).message
    expect(message).toContain(name)
    expect(message).not.toContain('test-key-123')
  })
})
