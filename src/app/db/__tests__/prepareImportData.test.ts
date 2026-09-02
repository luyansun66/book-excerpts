import { describe, expect, it } from 'vitest'
import { prepareImportData } from '../prepare'
import type { Category, Book, Quote } from '../../types'

const catLit: Category = {
  id: 'cat-lit',
  name: '文学',
  isPreset: true,
  order: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
}

function makeBook(categoryId: string): Book {
  return {
    id: 'book-1',
    title: '测试书',
    author: '',
    categoryId,
    coverType: null,
    coverData: null,
    sortOrder: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

const noQuotes: Quote[] = []

describe('prepareImportData', () => {
  it('moves a book whose categoryId points to a missing category into the first category', () => {
    const { data, repairedCount } = prepareImportData({
      exportDate: '',
      version: 1,
      categories: [catLit],
      books: [makeBook('ghost-category')],
      quotes: noQuotes,
    })

    expect(data.books[0].categoryId).toBe('cat-lit')
    expect(repairedCount).toBe(1)
  })

  it('leaves a book with a valid categoryId untouched and reports zero repairs', () => {
    const { data, repairedCount } = prepareImportData({
      exportDate: '',
      version: 1,
      categories: [catLit],
      books: [makeBook('cat-lit')],
      quotes: noQuotes,
    })

    expect(data.books[0].categoryId).toBe('cat-lit')
    expect(repairedCount).toBe(0)
  })
})
