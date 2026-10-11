import { describe, expect, it } from 'vitest'
import { restorePaneCollapseState } from './previewLayout'

describe('restorePaneCollapseState', () => {
  it('preserves collapsed panes when leaving expanded preview from its header', () => {
    expect(restorePaneCollapseState({ left: false, right: true })).toEqual({ left: false, right: true })
  })

  it('expands the selected rail and preserves the other pane state', () => {
    expect(restorePaneCollapseState({ left: true, right: false }, 'left')).toEqual({ left: false, right: false })
    expect(restorePaneCollapseState({ left: false, right: true }, 'left')).toEqual({ left: false, right: true })
  })
})
