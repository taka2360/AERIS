import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { createMockProvider } from '@/providers/mock'
import { App } from './App'

const clock = '2026-10-04T16:24:00+09:00'

beforeEach(() => {
  window.sessionStorage.setItem('aeris.booted', '1') // skip boot overlay
  window.localStorage.clear()
})

describe('AERIS terminal (mock provider)', () => {
  it('renders observation-first current conditions with provenance', async () => {
    render(<App provider={createMockProvider({ clock, latency: [0, 0] })} />)
    const panel = await screen.findByRole('region', { name: 'CURRENT ATMOSPHERIC STATUS' })
    await waitFor(() => expect(within(panel).getAllByText('OBS').length).toBeGreaterThan(3))
    expect(within(panel).getAllByText('MDL').length).toBeGreaterThan(0)
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'JMA WARNING SYSTEM' })).toHaveTextContent(
        '雷注意報',
      ),
    )
    // AERIS status is labelled as non-official, separately from JMA
    expect(screen.getByRole('region', { name: 'AERIS STATUS' })).toHaveTextContent(
      '気象庁の警報・注意報ではありません',
    )
  })

  it('timeline cursor is keyboard operable and readout follows it', async () => {
    render(<App provider={createMockProvider({ clock, latency: [0, 0] })} />)
    const slider = await screen.findByRole('slider')
    const readout = screen.getByLabelText('カーソル位置の値')
    expect(readout).toHaveTextContent('16:00')
    slider.focus()
    await userEvent.keyboard('{ArrowRight}{ArrowRight}')
    expect(readout).toHaveTextContent('18:00')
    expect(readout).toHaveTextContent('T+02H')
    await userEvent.keyboard('{Escape}')
    expect(readout).toHaveTextContent('16:00')
  })

  it('shows a degraded system when a source fails, and keeps other data', async () => {
    render(<App provider={createMockProvider({ clock, latency: [0, 0], fail: ['jma-warning'] })} />)
    const sys = await screen.findByRole('region', { name: 'SYSTEM' })
    await waitFor(() => expect(sys).toHaveTextContent('DEGRADED'), { timeout: 4000 })
    expect(screen.getByRole('region', { name: 'JMA WARNING SYSTEM' })).toHaveTextContent(
      'UNAVAILABLE',
    )
    expect(screen.getByRole('region', { name: 'CURRENT ATMOSPHERIC STATUS' })).toHaveTextContent(
      'OBS',
    )
  })
})
