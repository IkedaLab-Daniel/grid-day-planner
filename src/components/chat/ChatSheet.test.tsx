import { describe, test, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ChatSheet, type ChatMessageView } from '@/components/chat/ChatSheet'

const OPENING = 'What are you doing now, and when did you start?'
const msg = (id: string, role: 'user' | 'assistant', content: string, ageMinutes: number): ChatMessageView => ({
  id,
  role,
  content,
  createdAt: new Date(Date.now() - ageMinutes * 60_000).toISOString(),
})

function setup(opts: {
  history?: ChatMessageView[]
  send?: (m: string) => Promise<{ reply: string; changed: boolean }>
} = {}) {
  const onClose = vi.fn()
  const onChanged = vi.fn()
  const send = vi.fn(opts.send ?? (async () => ({ reply: 'Logged CS50', changed: true })))
  const loadHistory = vi.fn(async () => opts.history ?? [])
  render(<ChatSheet open onClose={onClose} onChanged={onChanged} send={send} loadHistory={loadHistory} />)
  return { onClose, onChanged, send, loadHistory }
}

describe('ChatSheet', () => {
  test('shows the opening line when there is no history', async () => {
    setup()
    expect(await screen.findByText(OPENING)).toBeInTheDocument()
  })

  test('shows the opening line above old history, and the history in order', async () => {
    setup({ history: [msg('1', 'user', 'old hello', 300), msg('2', 'assistant', 'old reply', 299)] })
    expect(await screen.findByText(OPENING)).toBeInTheDocument()
    const text = document.body.textContent ?? ''
    expect(text.indexOf('old hello')).toBeGreaterThan(text.indexOf(OPENING))
    expect(text.indexOf('old reply')).toBeGreaterThan(text.indexOf('old hello'))
  })

  test('no opening line when the last message is recent', async () => {
    setup({ history: [msg('1', 'user', 'just now', 5), msg('2', 'assistant', 'got it', 4)] })
    expect(await screen.findByText('got it')).toBeInTheDocument()
    expect(screen.queryByText(OPENING)).not.toBeInTheDocument()
  })

  test('Send is disabled for empty input and while a message is pending', async () => {
    let release!: () => void
    setup({ send: () => new Promise((resolve) => { release = () => resolve({ reply: 'ok', changed: false }) }) })
    const send = screen.getByRole('button', { name: 'Send' })
    expect(send).toBeDisabled()
    await userEvent.type(screen.getByRole('textbox'), 'hello')
    expect(send).toBeEnabled()
    await userEvent.click(send)
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
    release()
    await screen.findByText('ok')
  })

  test('Enter sends the text, shows the user bubble and Thinking… immediately', async () => {
    let release!: () => void
    const { send } = setup({ send: () => new Promise((resolve) => { release = () => resolve({ reply: 'Done', changed: false }) }) })
    await userEvent.type(screen.getByRole('textbox'), 'I started CS50{Enter}')
    expect(send).toHaveBeenCalledWith('I started CS50')
    expect(screen.getByText('I started CS50')).toBeInTheDocument()
    expect(screen.getByText('Thinking…')).toBeInTheDocument()
    release()
    await waitFor(() => expect(screen.queryByText('Thinking…')).not.toBeInTheDocument())
  })

  test('a reply that changed data calls onChanged; one that did not does not', async () => {
    const changed = setup({ send: async () => ({ reply: 'Logged', changed: true }) })
    await userEvent.type(screen.getByRole('textbox'), 'x{Enter}')
    await screen.findByText('Logged')
    expect(changed.onChanged).toHaveBeenCalledTimes(1)
  })

  test('a reply with no change does not call onChanged', async () => {
    const same = setup({ send: async () => ({ reply: 'Nothing to log', changed: false }) })
    await userEvent.type(screen.getByRole('textbox'), 'hi{Enter}')
    await screen.findByText('Nothing to log')
    expect(same.onChanged).not.toHaveBeenCalled()
  })

  test('a failed send shows an alert, restores the text and Retry sends it again', async () => {
    const send = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({ reply: 'Back online', changed: false })
    setup({ send })
    await userEvent.type(screen.getByRole('textbox'), 'log CS50{Enter}')
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('textbox')).toHaveValue('log CS50')
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(send).toHaveBeenCalledTimes(2)
    expect(send).toHaveBeenLastCalledWith('log CS50')
    await screen.findByText('Back online')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  test('Escape closes the sheet', async () => {
    const { onClose } = setup()
    await screen.findByText(OPENING)
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  test('a message sent while the history is still loading is not lost when it arrives', async () => {
    let resolveHistory!: (h: ChatMessageView[]) => void
    const loadHistory = vi.fn(() => new Promise<ChatMessageView[]>((resolve) => { resolveHistory = resolve }))
    const send = vi.fn(async () => ({ reply: 'ok', changed: false }))
    render(<ChatSheet open onClose={vi.fn()} onChanged={vi.fn()} send={send} loadHistory={loadHistory} />)
    await userEvent.type(screen.getByRole('textbox'), 'quick one{Enter}')
    await screen.findByText('ok')
    resolveHistory([msg('1', 'user', 'earlier', 300)])
    expect(await screen.findByText('earlier')).toBeInTheDocument()
    expect(screen.getByText('quick one')).toBeInTheDocument()
    const text = document.body.textContent ?? ''
    expect(text.indexOf('earlier')).toBeLessThan(text.indexOf('quick one'))
  })
})
