import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SessionProvider } from '@/features/auth/SessionProvider'
import { ApiRequestError } from '@/lib/api'
import { GLOBAL_REPORT_DEMO, operatorApi } from '@/services/operatorApi'
import type { GlobalReport } from '@/types/operator'
import GlobalReportPage from './GlobalReportPage'

const counts = { new: 3, updated: 95, deactivated: 1, reactivated: 0, moved: 0, located: 2, not_in_report: 0 }
const preview: GlobalReport = {
  id: 'gr-1',
  report_date: '2026-11-03',
  file_name: 'global-report.xlsx',
  size_bytes: 1000,
  uploaded_at: '2026-11-04T09:00:00Z',
  uploaded_by: 'Orange Sierra Leone',
  status: 'previewed',
  applied_at: null,
  applied_by: null,
  summary: {
    rows: 100,
    importable: 98,
    held_back: 1,
    aggregators: 2,
    issues: { bad_agent_code: 1 },
    regions: { west: 50 },
    rows_with_issues: [{ row: 17, kind: 'agent', issues: ['bad_agent_code'], importable: false }],
    columns: { coordinates: true, float: true, commission: false, activity: true },
    changes: {
      counts,
      lists: { new: [{ row: 4, agent_code: '700001', name: 'Mariama Sesay' }], updated: [], deactivated: [], reactivated: [], moved: [], located: [], not_in_report: [] },
      active_on_record: 95,
    },
  },
}

function page() {
  return render(
    <SessionProvider>
      <MemoryRouter>
        <GlobalReportPage />
      </MemoryRouter>
    </SessionProvider>,
  )
}

afterEach(() => vi.restoreAllMocks())

describe("Orange's Global Report", () => {
  it('reads the file, shows what applying will do, and applies it on request', async () => {
    vi.spyOn(operatorApi, 'globalReports').mockResolvedValue([])
    const upload = vi.spyOn(operatorApi, 'uploadGlobalReport').mockResolvedValue(preview)
    const apply = vi.spyOn(operatorApi, 'applyGlobalReport').mockResolvedValue({ ...preview, status: 'applied', applied_by: 'Orange Sierra Leone', applied_at: '2026-11-04T09:05:00Z' })
    const user = userEvent.setup()
    page()
    expect(await screen.findByText('No report has been added yet.')).toBeInTheDocument()
    await user.upload(screen.getByLabelText('Report file'), new File(['x'], 'global-report.xlsx'))
    await user.click(screen.getByRole('button', { name: 'Read the report' }))
    expect(upload).toHaveBeenCalled()
    expect(await screen.findByText('Report for 2026-11-03')).toBeInTheDocument()
    expect(screen.getByText('Shop locations: in the report')).toBeInTheDocument()
    expect(screen.getByText('Commission: not in the report')).toBeInTheDocument()
    expect(screen.getByText(/agent code is not 6 digits/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Apply to the network' }))
    expect(apply).toHaveBeenCalledWith('gr-1', false)
    expect(await screen.findByText(/Applied by Orange Sierra Leone/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Apply to the network' })).not.toBeInTheDocument()
  })

  it('a report much shorter than the network asks for a second yes', async () => {
    vi.spyOn(operatorApi, 'globalReports').mockResolvedValue([preview])
    const apply = vi
      .spyOn(operatorApi, 'applyGlobalReport')
      .mockRejectedValueOnce(new ApiRequestError(409, { code: 'report_shrunk', message: 'This report lists 10 of the 95 active agents on record.', request_id: null }))
      .mockResolvedValueOnce({ ...preview, status: 'applied' })
    const user = userEvent.setup()
    page()
    await user.click(await screen.findByRole('button', { name: /2026-11-03/ }))
    await user.click(screen.getByRole('button', { name: 'Apply to the network' }))
    expect(await screen.findByText(/lists 10 of the 95/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Apply anyway' }))
    expect(apply).toHaveBeenLastCalledWith('gr-1', true)
  })

  it('the demo build says the upload needs the live system', async () => {
    const user = userEvent.setup()
    page()
    await user.upload(screen.getByLabelText('Report file'), new File(['x'], 'r.csv'))
    await user.click(screen.getByRole('button', { name: 'Read the report' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(GLOBAL_REPORT_DEMO)
  })
})
