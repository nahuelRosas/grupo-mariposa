import { Inject, Injectable } from '@nestjs/common';
import { BOOK_REPOSITORY } from '../../../shared/di-tokens/tokens';
import { BookRepositoryPort } from '../../../domain/ports/book-repository.port';
import { BookNotFoundException } from '../../../domain/exceptions/book-not-found.exception';
import { toBookResponse, BookResponseDto } from '../../mappers/book.mapper';

@Injectable()
export class GetBookUseCase {
  constructor(@Inject(BOOK_REPOSITORY) private readonly books: BookRepositoryPort) {}

  async execute(id: string): Promise<BookResponseDto> {
    const book = await this.books.findById(id);
    if (!book) throw new BookNotFoundException(id);
    return toBookResponse(book);
  }
}
