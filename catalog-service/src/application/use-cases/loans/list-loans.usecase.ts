import { Inject, Injectable } from '@nestjs/common';
import { LOAN_REPOSITORY } from '../../../shared/di-tokens/tokens';
import { ListLoansFilter, LoanRepositoryPort } from '../../../domain/ports/loan-repository.port';
import { toLoanResponse, LoanResponseDto } from '../../mappers/loan.mapper';

export interface ListLoansInput {
  page: number;
  pageSize: number;
  status?: 'PENDING' | 'ACTIVE' | 'ROLLED_BACK';
  userId?: string;
  bookId?: string;
}

export interface ListLoansOutput {
  items: LoanResponseDto[];
  page: number;
  pageSize: number;
  total: number;
}

@Injectable()
export class ListLoansUseCase {
  constructor(@Inject(LOAN_REPOSITORY) private readonly loans: LoanRepositoryPort) {}

  async execute(input: ListLoansInput): Promise<ListLoansOutput> {
    const filter: ListLoansFilter = {
      page: input.page,
      pageSize: input.pageSize,
    };
    if (input.status) filter.status = input.status;
    if (input.userId) filter.userId = input.userId;
    if (input.bookId) filter.bookId = input.bookId;
    const { items, total } = await this.loans.list(filter);
    return {
      items: items.map(toLoanResponse),
      page: input.page,
      pageSize: input.pageSize,
      total,
    };
  }
}
