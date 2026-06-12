import { Book } from '../../domain/entities/book.entity';

export interface BookResponseDto {
  id: string;
  isbn: string;
  title: string;
  author: string;
  publisher: string | null;
  publishedYear: number | null;
  genre: string | null;
  totalStock: number;
  availableStock: number;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export const toBookResponse = (b: Book): BookResponseDto => ({
  id: b.id,
  isbn: b.isbn,
  title: b.title,
  author: b.author,
  publisher: b.publisher,
  publishedYear: b.publishedYear,
  genre: b.genre,
  totalStock: b.totalStock,
  availableStock: b.availableStock,
  description: b.description,
  createdAt: b.createdAt,
  updatedAt: b.updatedAt,
});
