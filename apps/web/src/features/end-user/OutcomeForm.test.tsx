import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { OutcomeForm } from './OutcomeForm'
import { customerApi } from '@/services/customerApi'

function renderForm() {
  const onDone = vi.fn()
  render(
    <OutcomeForm
      agentId="af-4821"
      agentName="Fatmata's Shop"
      transaction="cash_out"
      amount={2000}
      source="search"
      onDone={onDone}
      onSkip={vi.fn()}
    />,
  )
  return { onDone }
}

describe('U7 — Service outcome', () => {
  it('requires a reason before continuing when the answer is No', async () => {
    const user = userEvent.setup()
    renderForm()
    await user.click(screen.getByRole('radio', { name: 'No' }))
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()
    await user.click(screen.getByRole('radio', { name: 'Agent had less than requested' }))
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled()
  })

  it('sends one report with a stable token, so a double tap cannot double-submit', async () => {
    const user = userEvent.setup()
    const spy = vi.spyOn(customerApi, 'report')
    renderForm()
    await user.click(screen.getByRole('radio', { name: "I didn't go" }))
    const button = screen.getByRole('button', { name: 'Continue' })
    await user.click(button)
    await user.click(button)
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0]?.[0]).toMatchObject({ agent_id: 'af-4821', answer: 'did_not_go', rating: null })
    spy.mockRestore()
  })

  it('keeps the customer on the form with a message when sending fails', async () => {
    const user = userEvent.setup()
    vi.spyOn(customerApi, 'report').mockRejectedValue(new Error('offline'))
    renderForm()
    await user.click(screen.getByRole('radio', { name: "I didn't go" }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByText(/could not send that/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled()
  })

  it('carries no customer identity in the report body', async () => {
    const user = userEvent.setup()
    const spy = vi.spyOn(customerApi, 'report')
    renderForm()
    await user.click(screen.getByRole('radio', { name: "I didn't go" }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    const body = spy.mock.calls[0]?.[0] as unknown as Record<string, unknown>
    expect(Object.keys(body).sort()).toEqual(
      ['agent_id', 'amount_sle', 'answer', 'client_token', 'comment', 'rating', 'reason_code', 'source', 'transaction'].sort(),
    )
    spy.mockRestore()
  })

  it('keeps the rating optional and states that it stays inside the network', async () => {
    const user = userEvent.setup()
    renderForm()
    await user.click(screen.getByRole('radio', { name: 'Yes' }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByRole('heading', { name: 'Rate this visit' })).toBeInTheDocument()
    expect(screen.getByText(/never other customers or the agent/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Skip rating' })).toBeInTheDocument()
  })
})
