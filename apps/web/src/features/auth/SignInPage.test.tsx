import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { SessionProvider } from './SessionProvider'
import SignInPage from './SignInPage'

function App() {
  return (
    <SessionProvider>
      <MemoryRouter initialEntries={['/sign-in']}>
        <Routes>
          <Route path="/sign-in" element={<SignInPage />} />
        </Routes>
      </MemoryRouter>
    </SessionProvider>
  )
}

beforeEach(() => sessionStorage.clear())

describe('sign in, the number step', () => {
  it('says plainly when a number is too short, and stays on the number', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.type(await screen.findByLabelText(/^phone number$/i), '76123')
    await user.click(screen.getByRole('button', { name: /^continue$/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/enter your 9-digit orange number/i)
    expect(screen.queryByLabelText(/^pin$/i)).not.toBeInTheDocument()
  })

  it('goes on to the PIN for a full number', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.type(await screen.findByLabelText(/^phone number$/i), '076 123 456')
    await user.click(screen.getByRole('button', { name: /^continue$/i }))
    expect(await screen.findByLabelText(/^pin$/i)).toBeInTheDocument()
    expect(screen.queryByText(/enter your 9-digit orange number/i)).not.toBeInTheDocument()
  })
})
