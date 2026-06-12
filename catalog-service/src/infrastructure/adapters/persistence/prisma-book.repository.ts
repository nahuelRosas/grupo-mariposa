import { Inject, Injectable } from '@nestjs/common';
import { PRISMA_CLIENT } from '../../../shared/di-tokens/tokens';
import {
  BookRepositoryPort,
  ListBooksOptions,
  PrismaTx,
} from '../../../domain/ports/book-repository.port';
import { Book } from '../../../domain/entities/book.entity';
import { PrismaClient, Prisma } from '@prisma/client';

function rowToBook(row: {
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
}): Book {
  return new Book(
    row.id,
    row.isbn,
    row.title,
    row.author,
    row.publisher,
    row.publishedYear,
    row.genre,
    row.totalStock,
    row.availableStock,
    row.description,
    row.createdAt,
    row.updatedAt,
  );
}

@Injectable()
export class PrismaBookRepository implements BookRepositoryPort {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<Book | null> {
    const row = await this.prisma.book.findUnique({ where: { id } });
    return row ? rowToBook(row) : null;
  }

  async findByIsbn(isbn: string): Promise<Book | null> {
    const row = await this.prisma.book.findUnique({ where: { isbn } });
    return row ? rowToBook(row) : null;
  }

  async findAll(opts: ListBooksOptions): Promise<{ items: Book[]; total: number }> {
    const where: Prisma.BookWhereInput = opts.search
      ? {
          OR: [
            { title: { contains: opts.search, mode: 'insensitive' as const } },
            { author: { contains: opts.search, mode: 'insensitive' as const } },
            { isbn: { contains: opts.search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    if (opts.author) where.author = { contains: opts.author, mode: 'insensitive' as const };
    if (opts.genre) where.genre = { contains: opts.genre, mode: 'insensitive' as const };
    if (opts.availability) where.availableStock = { gt: 0 };
    else if (opts.availability === false) where.availableStock = 0;

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.book.findMany({
        where,
        skip: opts.skip,
        take: opts.take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.book.count({ where }),
    ]);
    return { items: rows.map(rowToBook), total };
  }

  async save(book: Book): Promise<Book> {
    const row = await this.prisma.book.create({
      data: {
        isbn: book.isbn,
        title: book.title,
        author: book.author,
        publisher: book.publisher,
        publishedYear: book.publishedYear,
        genre: book.genre,
        totalStock: book.totalStock,
        availableStock: book.availableStock,
        description: book.description,
      },
    });
    return rowToBook(row);
  }

  async update(id: string, patch: Partial<Book>): Promise<Book> {
    const row = await this.prisma.book.update({
      where: { id },
      data: {
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.author !== undefined ? { author: patch.author } : {}),
        ...(patch.publisher !== undefined ? { publisher: patch.publisher } : {}),
        ...(patch.publishedYear !== undefined ? { publishedYear: patch.publishedYear } : {}),
        ...(patch.genre !== undefined ? { genre: patch.genre } : {}),
        ...(patch.totalStock !== undefined ? { totalStock: patch.totalStock } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
      },
    });
    return rowToBook(row);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.book.delete({ where: { id } });
  }

  async decrementStockInTx(tx: PrismaTx, bookId: string, qty: number): Promise<Book> {
    const row = await tx.book.update({
      where: { id: bookId },
      data: { availableStock: { decrement: qty } },
    });
    return rowToBook(row);
  }

  async incrementStockInTx(tx: PrismaTx, bookId: string, qty: number): Promise<Book> {
    const row = await tx.book.update({
      where: { id: bookId },
      data: { availableStock: { increment: qty } },
    });
    return rowToBook(row);
  }
}
