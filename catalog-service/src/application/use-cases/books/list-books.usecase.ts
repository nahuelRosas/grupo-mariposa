import { Inject, Injectable } from '@nestjs/common';
import { BOOK_REPOSITORY } from '../../../shared/di-tokens/tokens';
import { BookRepositoryPort } from '../../../domain/ports/book-repository.port';
import { toBookResponse, BookResponseDto } from '../../mappers/book.mapper';

export interface ListBooksInput {
  page: number;
  pageSize: number;
  search?: string;
  author?: string;
  genre?: string;
  availability?: boolean;
}

export interface ListBooksOutput {
  items: BookResponseDto[];
  page: number;
  pageSize: number;
  total: number;
}

@Injectable()
export class ListBooksUseCase {
  constructor(@Inject(BOOK_REPOSITORY) private readonly books: BookRepositoryPort) {}

  async execute(input: ListBooksInput): Promise<ListBooksOutput> {
    const skip = (input.page - 1) * input.pageSize;
    const { items, total } = await this.books.findAll({
      skip,
      take: input.pageSize,
      search: input.search,
      author: input.author,
      genre: input.genre,
      availability: input.availability,
    });
    return {
      items: items.map(toBookResponse),
      page: input.page,
      pageSize: input.pageSize,
      total,
    };
  }
}
