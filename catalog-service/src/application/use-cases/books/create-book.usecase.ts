import { Inject, Injectable } from '@nestjs/common';
import { BOOK_REPOSITORY } from '../../../shared/di-tokens/tokens';
import { BookRepositoryPort } from '../../../domain/ports/book-repository.port';
import { Book } from '../../../domain/entities/book.entity';
import { DuplicateIsbnException } from '../../../domain/exceptions/duplicate-isbn.exception';
import { toBookResponse, BookResponseDto } from '../../mappers/book.mapper';

export interface CreateBookInput {
  isbn: string;
  title: string;
  author: string;
  publisher?: string;
  publishedYear?: number;
  genre?: string;
  totalStock: number;
  description?: string;
}

@Injectable()
export class CreateBookUseCase {
  constructor(@Inject(BOOK_REPOSITORY) private readonly books: BookRepositoryPort) {}

  async execute(input: CreateBookInput): Promise<BookResponseDto> {
    const existing = await this.books.findByIsbn(input.isbn);
    if (existing) throw new DuplicateIsbnException(input.isbn);
    const now = new Date();
    const book = new Book(
      '',
      input.isbn,
      input.title,
      input.author,
      input.publisher ?? null,
      input.publishedYear ?? null,
      input.genre ?? null,
      input.totalStock,
      input.totalStock,
      input.description ?? null,
      now,
      now,
    );
    const saved = await this.books.save(book);
    return toBookResponse(saved);
  }
}
