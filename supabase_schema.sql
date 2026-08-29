-- Run this in Supabase SQL Editor: https://vnbudeahnuysdbqxtzgk.supabase.co → SQL Editor

-- Categories table
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  color TEXT
);

-- Books table
CREATE TABLE IF NOT EXISTS books (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL,
  title TEXT NOT NULL,
  author TEXT DEFAULT '',
  cover_type TEXT,
  cover_data TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT NOT NULL
);

-- Quotes table
CREATE TABLE IF NOT EXISTS quotes (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  book_id TEXT NOT NULL,
  text TEXT NOT NULL,
  thought TEXT DEFAULT '',
  page TEXT,
  date TEXT NOT NULL,
  "order" INTEGER DEFAULT 0
);

-- Indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_categories_user ON categories(user_id);
CREATE INDEX IF NOT EXISTS idx_books_user ON books(user_id);
CREATE INDEX IF NOT EXISTS idx_books_category ON books(category_id);
CREATE INDEX IF NOT EXISTS idx_quotes_user ON quotes(user_id);
CREATE INDEX IF NOT EXISTS idx_quotes_book ON quotes(book_id);

-- Enable Row Level Security
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE books ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;

-- RLS policies: users can only access their own data
CREATE POLICY "Users manage own categories" ON categories
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users manage own books" ON books
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users manage own quotes" ON quotes
  FOR ALL USING (auth.uid() = user_id);
