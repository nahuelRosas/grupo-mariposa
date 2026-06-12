import { Inject, Injectable } from '@nestjs/common';
import { PRISMA_CLIENT } from '../../../shared/di-tokens/tokens';
import { LoanRepositoryPort } from '../../../domain/ports/loan-repository.port';
import { Loan, LoanStatus } from '../../../domain/entities/loan.entity';
import { PrismaClient, Prisma } from '@prisma/client';

function rowToLoan(row: {
  id: string;
  remoteLoanId: string | null;
  userId: string;
  bookId: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}): Loan {
  return new Loan(
    row.id,
    row.remoteLoanId,
    row.userId,
    row.bookId,
    row.status as LoanStatus,
    row.createdAt,
    row.updatedAt,
  );
}

@Injectable()
export class PrismaLoanRepository implements LoanRepositoryPort {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<Loan | null> {
    const row = await this.prisma.loan.findUnique({ where: { id } });
    return row ? rowToLoan(row) : null;
  }

  async findByRemoteLoanId(remoteLoanId: string): Promise<Loan | null> {
    const row = await this.prisma.loan.findUnique({ where: { remoteLoanId } });
    return row ? rowToLoan(row) : null;
  }

  async list(filter: {
    userId?: string;
    bookId?: string;
    status?: 'PENDING' | 'ACTIVE' | 'ROLLED_BACK';
    page: number;
    pageSize: number;
  }): Promise<{ items: Loan[]; total: number }> {
    const where: Prisma.LoanWhereInput = {};
    if (filter.userId) where.userId = filter.userId;
    if (filter.bookId) where.bookId = filter.bookId;
    if (filter.status) where.status = filter.status;
    const skip = (filter.page - 1) * filter.pageSize;
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.loan.findMany({
        where,
        skip,
        take: filter.pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.loan.count({ where }),
    ]);
    return { items: rows.map(rowToLoan), total };
  }
}
