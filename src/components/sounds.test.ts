import { describe, expect, it } from 'vitest'
import { pickVariant } from './sounds.ts'

describe('pickVariant', () => {
  const files = ['play1.mp3', 'play2.mp3', 'play3.mp3']

  it('never repeats the last sound, and uses every version over time', () => {
    let last: string | undefined
    const seen = new Set<string>()
    for (let i = 0; i < 300; i++) {
      const next = pickVariant(files, last)
      expect(files).toContain(next)
      expect(next).not.toBe(last)
      seen.add(next)
      last = next
    }
    expect(seen.size).toBe(3)
  })

  it('works with a single version (repeating is the only option)', () => {
    expect(pickVariant(['bomb1.mp3'], 'bomb1.mp3')).toBe('bomb1.mp3')
  })
})
