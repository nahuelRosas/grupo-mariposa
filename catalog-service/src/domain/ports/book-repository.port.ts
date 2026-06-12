import { Book } from '../entities/book.entity';
import { Prisma } from '@prisma/client';

export type PrismaTx = Prisma.TransactionClient;

export interface ListBooksOptions {
  skip: number;
  take: number;
  search?: string;
  author?: string;
  genre?: string;
  availability?: boolean;
}

export interface BookRepositoryPort {
  findById(id: string): Promise<Book | null>;
  findByIsbn(isbn: string): Promise<Book | null>;
  findAll(opts: ListBooksOptions): Promise<{ items: Book[]; total: number }>;
  save(book: Book): Promise<Book>;
  update(id: string, patch: Partial<Book>): Promise<Book>;
  delete(id: string): Promise<void>;

  decrementStockInTx(tx: PrismaTx, bookId: string, qty: number): Promise<Book>;
  incrementStockInTx(tx: PrismaTx, bookId: string, qty: number): Promise<Book>;
}
