import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import HostHomePage from './HostHomePage'

function Probe() {
  const loc = useLocation()
  return <div data-testid="where">{loc.pathname + loc.search}</div>
}

function App() {
  return (
    <MemoryRouter initialEntries={['/']}>
      <Probe />
      <Routes>
        <Route path="/" element={<HostHomePage />} />
        <Route path="/find" element={<p>Agent Finder module</p>} />
      </Routes>
    </MemoryRouter>
  )
}

describe('demo host shell', () => {
  it('opens the Agent Finder module from the banner and marks where the customer came from', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: /agent finder/i }))
    expect(screen.getByTestId('where')).toHaveTextContent('/find?from=host')
    expect(screen.getByText('Agent Finder module')).toBeInTheDocument()
  })

  it('says plainly that it is a simulation and that the rest is inactive', () => {
    render(<App />)
    expect(screen.getByRole('note')).toHaveTextContent(/simulated host app/i)
    expect(screen.getByText(/only the agent finder banner is active/i)).toBeInTheDocument()
  })

  it('offers no sign-in, transfer or payment control', () => {
    render(<App />)
    // The banner is the only button on the shell; the skip link is the only link.
    expect(screen.getAllByRole('button')).toHaveLength(1)
    expect(screen.getAllByRole('link')).toHaveLength(1)
    expect(screen.queryByLabelText(/pin|password|amount/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })
})
