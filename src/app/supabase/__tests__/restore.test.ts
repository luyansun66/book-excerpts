import { describe, expect, it, vi } from 'vitest'
import { restoreFromCloud } from '../restore'
import type { Category, Book, Quote } from '../../types'

const catLit: Category = {
  id: 'cat-lit',
  name: '文学',
  isPreset: true,
  order: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
}

const book: Book = {
  id: 'book-1',
  title: '测试书',
  author: '',
  categoryId: 'cat-lit',
  coverType: null,
  coverData: null,
  sortOrder: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const quotes: Quote[] = []

describe('restoreFromCloud', () => {
  it('waits for the database replacement to finish before refreshing the UI', async () => {
    let replaceFinished = false
    const pull = vi.fn(async () => ({
      categories: [catLit],
      books: [book],
      quotes,
    }))
    const replace = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
      replaceFinished = true
      return { categories: 1, books: 1, quotes: 0 }
    })
    const refresh = vi.fn(async () => {
      if (!replaceFinished) throw new Error('refresh ran before database replacement completed')
    })

    const result = await restoreFromCloud({ pull, replace, refresh })

    expect(refresh).toHaveBeenCalledTimes(1)
    expect(replace).toHaveBeenCalledTimes(1)
    expect(result.repairedCount).toBe(0)
  })

  it('reports how many books were repaired during import', async () => {
    const pull = vi.fn(async () => ({
      categories: [catLit],
      books: [{ ...book, categoryId: 'missing-category' }],
      quotes,
    }))
    const replace = vi.fn(async () => ({ categories: 1, books: 1, quotes: 0 }))
    const refresh = vi.fn(async () => {})

    const result = await restoreFromCloud({ pull, replace, refresh })

    expect(result.repairedCount).toBe(1)
    expect(replace).toHaveBeenCalledWith(
      expect.objectContaining({
        books: [expect.objectContaining({ categoryId: 'cat-lit' })],
      }),
    )
  })
})
