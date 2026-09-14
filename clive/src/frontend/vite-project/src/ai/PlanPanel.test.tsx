// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

// Keys pass through verbatim: tests assert structure and stable key names,
// never localized copy (same convention as ChatDrawer.test.tsx).
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

import { PlanPanel, buildPlanTree } from './PlanPanel.js'
import type { Plan, PlanOp } from './plan.js'
import type { ApplyReport } from '../api.js'
import type { PlanPhase } from './usePlan.js'

const entry = (name: string) => ({ name, path: `/root/${name}`, isDir: false, size: 1, modified: 0, extension: null })

const fullPlan = (): Plan => ({
  rootPath: '/root',
  ops: [
    { id: 'f1', kind: 'createFolder', path: '/root/A', included: true },
    { id: 'f2', kind: 'createFolder', path: '/root/A/B', included: true },
    { id: 'm1', kind: 'move', path: '/root/one.pdf', destDir: '/root/A', included: true },
    { id: 'm2', kind: 'move', path: '/root/two.pdf', destDir: '/root/A/B', included: true },
    { id: 'r1', kind: 'rename', path: '/root/old.txt', newName: 'new.txt', included: true },
    { id: 't1', kind: 'trash', path: '/root/junk.dmg', included: true },
  ],
  unchanged: [entry('keepme.txt')],
  warnings: [],
})

const noTrashPlan = (): Plan => ({
  ...fullPlan(),
  ops: fullPlan().ops.filter((o) => o.kind !== 'trash'),
})

const ctrl = (over: Partial<Record<string, unknown>> = {}) => ({
  plan: fullPlan(),
  phase: 'review' as PlanPhase,
  progress: null,
  report: null,
  undoReport: null,
  batchId: null,
  error: null,
  setPlan: vi.fn(),
  close: vi.fn(),
  toggleOp: vi.fn(),
  updateOp: vi.fn(),
  apply: vi.fn().mockResolvedValue(undefined),
  undo: vi.fn().mockResolvedValue(undefined),
  ...over,
})

const report: ApplyReport = {
  applied: 4,
  skipped: 1,
  failed: [{ id: '/root/bad.pdf', error: 'target exists' }],
  batchId: 'b1',
}

afterEach(cleanup)

describe('PlanPanel', () => {
  it('renders nothing when idle or without a plan', () => {
    const { container } = render(<PlanPanel ctrl={ctrl({ phase: 'idle' })} onClose={vi.fn()} />)
    expect(container.innerHTML).toBe('')
    const { container: c2 } = render(<PlanPanel ctrl={ctrl({ plan: null })} onClose={vi.fn()} />)
    expect(c2.innerHTML).toBe('')
  })

  it('shows stats line with correct counts', () => {
    const { container } = render(<PlanPanel ctrl={ctrl()} onClose={vi.fn()} />)
    const text = container.textContent ?? ''
    // The redesigned summary uses a compact metric card: value and label are
    // separate DOM nodes, so assert both pieces without depending on layout.
    expect(text).toContain('2')
    expect(text).toContain('plan.create')
    expect(text).toContain('plan.move')
    expect(text).toContain('plan.rename')
    expect(text).toContain('plan.trash')
    expect(text).toContain('plan.untouched')
  })

  it('issue op renders disabled unchecked checkbox + issue badge, click cannot enable', () => {
    const ops: PlanOp[] = [
      ...fullPlan().ops,
      { id: 'mx', kind: 'move', path: '/root/x.pdf', destDir: '/root/A', included: false, issue: 'target exists' },
    ]
    const c = ctrl({ plan: { ...fullPlan(), ops } })
    const { container } = render(<PlanPanel ctrl={c} onClose={vi.fn()} />)
    expect(screen.getByText('plan.targetExists')).toBeTruthy()
    const boxes = Array.from(container.querySelectorAll('input[type=checkbox]')) as HTMLInputElement[]
    const labels = boxes.map((b) => b.closest('label')?.textContent ?? '')
    const idx = labels.findIndex((l) => l.includes('x.pdf'))
    expect(idx).toBeGreaterThanOrEqual(0)
    expect(boxes[idx].disabled).toBe(true)
    expect(boxes[idx].checked).toBe(false)
    fireEvent.click(boxes[idx])
    expect(c.toggleOp).not.toHaveBeenCalled()
  })

  it('Apply with trash ops opens the second confirm; confirming calls apply', () => {
    const c = ctrl()
    render(<PlanPanel ctrl={c} onClose={vi.fn()} />)
    fireEvent.click(screen.getByText('plan.apply'))
    expect(c.apply).not.toHaveBeenCalled()
    expect(screen.getByText('plan.trashWarnTitle')).toBeTruthy()
    fireEvent.click(screen.getByText('plan.confirm'))
    expect(c.apply).toHaveBeenCalledTimes(1)
  })

  it('Apply without trash ops calls apply directly', () => {
    const c = ctrl({ plan: noTrashPlan() })
    render(<PlanPanel ctrl={c} onClose={vi.fn()} />)
    fireEvent.click(screen.getByText('plan.apply'))
    expect(c.apply).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('plan.trashWarnTitle')).toBeNull()
  })

  it('applying phase renders the progress bar and disables actions', () => {
    const c = ctrl({ phase: 'applying', progress: { done: 2, total: 5, currentId: '/root/one.pdf' } })
    const { container } = render(<PlanPanel ctrl={c} onClose={vi.fn()} />)
    const bar = container.querySelector('progress') as HTMLProgressElement | null
    expect(bar).not.toBeNull()
    expect(bar.value).toBe(2)
    expect(bar.max).toBe(5)
    expect(screen.getByText('plan.applying')).toBeTruthy()
    const applyBtn = screen.getByText('plan.apply') as HTMLButtonElement
    expect(applyBtn.disabled).toBe(true)
  })

  it('applied phase renders report + Annulla tutto wired to undo', () => {
    const c = ctrl({ phase: 'applied', report, batchId: 'b1' })
    const { container } = render(<PlanPanel ctrl={c} onClose={vi.fn()} />)
    const text = container.textContent ?? ''
    expect(text).toContain('4 plan.applied')
    expect(text).toContain('1 plan.skipped')
    expect(text).toContain('1 plan.failed')
    expect(text).toContain('/root/bad.pdf')
    expect(text).toContain('plan.targetExists')
    fireEvent.click(screen.getByText('plan.undoAll'))
    expect(c.undo).toHaveBeenCalledTimes(1)
  })

  it('error phase shows the message with retry calling apply again', () => {
    const c = ctrl({ phase: 'error', error: 'invalid batchId' })
    const { container } = render(<PlanPanel ctrl={c} onClose={vi.fn()} />)
    expect(container.textContent).toContain('invalid batchId')
    fireEvent.click(screen.getByText('plan.retry'))
    expect(c.apply).toHaveBeenCalledTimes(1)
  })

  it('checkbox toggle calls toggleOp for clean ops', () => {
    const c = ctrl()
    const { container } = render(<PlanPanel ctrl={c} onClose={vi.fn()} />)
    const boxes = Array.from(container.querySelectorAll('input[type=checkbox]')) as HTMLInputElement[]
    const t1 = boxes.find((b) => (b.closest('label')?.textContent ?? '').includes('junk.dmg'))
    expect(t1).toBeTruthy()
    fireEvent.click(t1 as HTMLInputElement)
    expect(c.toggleOp).toHaveBeenCalledWith('t1')
  })

  it('buildPlanTree nests move/trash/rename under their folders (A parent of A/B)', () => {
    const tree = buildPlanTree(fullPlan())
    expect(tree.path).toBe('/root')
    // root-level rows: rename + trash live in their source folder (the root)
    expect(tree.items.map((o) => o.id).sort()).toEqual(['r1', 't1'])
    const A = tree.children.find((c) => c.label === 'A')
    expect(A).toBeTruthy()
    expect(A!.createOp?.id).toBe('f1')
    // move m1 (dest /root/A) is a row of node A
    expect(A!.items.map((o) => o.id)).toEqual(['m1'])
    const B = A!.children.find((c) => c.label === 'B')
    expect(B).toBeTruthy()
    // A/B createFolder renders A as parent of B
    expect(B!.createOp?.id).toBe('f2')
    // move m2 (dest /root/A/B) is a row of node B, not of A or the root
    expect(B!.items.map((o) => o.id)).toEqual(['m2'])
  })
})
