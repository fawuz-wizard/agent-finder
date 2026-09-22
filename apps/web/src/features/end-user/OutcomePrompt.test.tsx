import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { OutcomePrompt } from './OutcomePrompt'
import { config } from '@/lib/config'

beforeEach(() => sessionStorage.clear())

function pendingSince(msAgo: number) {
  sessionStorage.setItem(
    'af.pendingVisit',
    JSON.stringify({ agentId: 'af-4821', agentName: "Fatmata's Shop", transaction: 'cash_out', amount: 2000, at: Date.now() - msAgo }),
  )
}

describe('outcome prompt', () => {
  it('waits for the visit to have plausibly happened', () => {
    pendingSince(1_000)
    render(<MemoryRouter><OutcomePrompt /></MemoryRouter>)
    expect(screen.queryByText(/did it work at/i)).not.toBeInTheDocument()
  })

  it('asks once, and closing it is an answer: it does not come back', async () => {
    const user = userEvent.setup()
    pendingSince(config.outcomePromptAfterMs + 1_000)
    const { unmount } = render(<MemoryRouter><OutcomePrompt /></MemoryRouter>)
    expect(await screen.findByText(/did it work at fatmata's shop\?/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /close/i }))
    expect(sessionStorage.getItem('af.pendingVisit')).toBeNull()
    unmount()
    render(<MemoryRouter><OutcomePrompt /></MemoryRouter>)
    expect(screen.queryByText(/did it work at/i)).not.toBeInTheDocument()
  })
})
