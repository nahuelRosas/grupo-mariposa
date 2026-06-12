import { Inject, Injectable } from '@nestjs/common';
import { BOOK_REPOSITORY } from '../../../shared/di-tokens/tokens';
import { BookRepositoryPort } from '../../../domain/ports/book-repository.port';
import { BookNotFoundException } from '../../../domain/exceptions/book-not-found.exception';

@Injectable()
export class DeleteBookUseCase {
  constructor(@Inject(BOOK_REPOSITORY) private readonly books: BookRepositoryPort) {}

  async execute(id: string): Promise<void> {
    const current = await this.books.findById(id);
    if (!current) throw new BookNotFoundException(id);
    await this.books.delete(id);
  }
}
