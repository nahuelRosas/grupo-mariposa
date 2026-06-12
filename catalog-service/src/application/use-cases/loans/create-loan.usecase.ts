import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import {
  BOOK_REPOSITORY,
  LOAN_SERVICE,
  PRISMA_CLIENT,
  USER_REPOSITORY,
} from '../../../shared/di-tokens/tokens';
import { BookRepositoryPort, PrismaTx } from '../../../domain/ports/book-repository.port';
import { UserRepositoryPort } from '../../../domain/ports/user-repository.port';
import { LoanServicePort } from '../../../domain/ports/loan-service.port';
import { BookNotFoundException } from '../../../domain/exceptions/book-not-found.exception';
import { UserNotFoundException } from '../../../domain/exceptions/user-not-found.exception';
import { InsufficientStockException } from '../../../domain/exceptions/insufficient-stock.exception';
import { LoanServiceUnavailableException } from '../../../domain/exceptions/loan-service-unavailable.exception';
import { Loan } from '../../../domain/entities/loan.entity';

export interface CreateLoanInput {
  userId: string;
  bookId: string;
  idempotencyKey?: string;
}

@Injectable()
export class CreateLoanUseCase {
  private readonly logger = new Logger(CreateLoanUseCase.name);

  constructor(
    @Inject(BOOK_REPOSITORY) private readonly bookRepo: BookRepositoryPort,
    @Inject(USER_REPOSITORY) private readonly userRepo: UserRepositoryPort,
    @Inject(LOAN_SERVICE) private readonly loanService: LoanServicePort,
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
  ) {}

  async execute(input: CreateLoanInput): Promise<Loan> {
    const idempotencyKey = input.idempotencyKey || randomUUID();
    this.logger.log(`[${idempotencyKey}] saga start user=${input.userId} book=${input.bookId}`);

    const [book, user] = await Promise.all([
      this.bookRepo.findById(input.bookId),
      this.userRepo.findById(input.userId),
    ]);
    if (!book) throw new BookNotFoundException(input.bookId);
    if (!user) throw new UserNotFoundException(input.userId);
    if (!book.hasStock(1)) throw new InsufficientStockException(input.bookId);

    try {
      const remote = await this.loanService.checkAvailability(input.bookId);
      if (!remote.exists) throw new BookNotFoundException(input.bookId);
      if (!remote.available) throw new InsufficientStockException(input.bookId);
    } catch (err) {
      if (err instanceof BookNotFoundException || err instanceof InsufficientStockException) {
        throw err;
      }
      this.logger.warn(
        `[${idempotencyKey}] pre-check failed, continuing (B will re-validate): ${(err as Error).message}`,
      );
    }

    let pending: { id: string };
    try {
      pending = await this.prisma.$transaction(async (tx: PrismaTx) => {
        const updated = await this.bookRepo.decrementStockInTx(tx as PrismaTx, book.id, 1);
        if (updated.availableStock < 0) {
          throw new InsufficientStockException(book.id);
        }
        const created = await tx.loan.create({
          data: {
            remoteLoanId: null,
            userId: user.id,
            bookId: book.id,
            status: 'PENDING',
          },
          select: { id: true },
        });
        return created;
      });
    } catch (err) {
      this.logger.error(
        `[${idempotencyKey}] step1 (decrement+pending) failed: ${(err as Error).message}`,
      );
      throw err;
    }

    let remote: { loanId: string; status: 'ACTIVE' | 'PENDING'; borrowedAt: string };
    try {
      remote = await this.loanService.createLoan({
        userId: user.id,
        bookId: book.id,
        isbn: book.isbn,
        idempotencyKey,
      });
    } catch (err) {
      this.logger.error(`[${idempotencyKey}] step2 (gRPC) failed: ${(err as Error).message}`);

      try {
        await this.prisma.$transaction(async (tx: PrismaTx) => {
          await this.bookRepo.incrementStockInTx(tx as PrismaTx, book.id, 1);
          await tx.loan.updateMany({
            where: { id: pending.id, status: 'PENDING' },
            data: { status: 'ROLLED_BACK' },
          });
        });
        this.logger.log(`[${idempotencyKey}] compensation OK`);
      } catch (compensateErr) {
        this.logger.error(
          `[${idempotencyKey}] COMPENSATION FAILED — manual intervention required: ${(compensateErr as Error).message}`,
        );
      }
      throw new LoanServiceUnavailableException(err);
    }

    const finalRow = await this.prisma.loan.update({
      where: { id: pending.id },
      data: { remoteLoanId: remote.loanId, status: remote.status },
    });
    this.logger.log(`[${idempotencyKey}] saga done remoteLoanId=${remote.loanId}`);

    return new Loan(
      finalRow.id,
      finalRow.remoteLoanId,
      finalRow.userId,
      finalRow.bookId,
      finalRow.status as Loan['status'],
      finalRow.createdAt,
      finalRow.updatedAt,
    );
  }
}
