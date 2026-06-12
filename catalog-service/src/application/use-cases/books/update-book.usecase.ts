import { Inject, Injectable } from '@nestjs/common';
import { BOOK_REPOSITORY } from '../../../shared/di-tokens/tokens';
import { BookRepositoryPort } from '../../../domain/ports/book-repository.port';
import { BookNotFoundException } from '../../../domain/exceptions/book-not-found.exception';
import { toBookResponse, BookResponseDto } from '../../mappers/book.mapper';

export interface UpdateBookInput {
  id: string;
  patch: {
    title?: string;
    author?: string;
    publisher?: string;
    publishedYear?: number;
    genre?: string;
    totalStock?: number;
    description?: string;
  };
}

@Injectable()
export class UpdateBookUseCase {
  constructor(@Inject(BOOK_REPOSITORY) private readonly books: BookRepositoryPort) {}

  async execute(input: UpdateBookInput): Promise<BookResponseDto> {
    const current = await this.books.findById(input.id);
    if (!current) throw new BookNotFoundException(input.id);
    const updated = await this.books.update(input.id, input.patch);
    return toBookResponse(updated);
  }
}
