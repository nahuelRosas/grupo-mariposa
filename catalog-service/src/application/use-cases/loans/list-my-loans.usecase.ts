import { Inject, Injectable } from '@nestjs/common';
import { LOAN_REPOSITORY } from '../../../shared/di-tokens/tokens';
import { LoanRepositoryPort } from '../../../domain/ports/loan-repository.port';
import { toLoanResponse, LoanResponseDto } from '../../mappers/loan.mapper';

export interface ListMyLoansInput {
  userId: string;
  status?: 'PENDING' | 'ACTIVE' | 'ROLLED_BACK';
  page: number;
  pageSize: number;
}

export interface ListMyLoansOutput {
  items: LoanResponseDto[];
  page: number;
  pageSize: number;
  total: number;
}

@Injectable()
export class ListMyLoansUseCase {
  constructor(@Inject(LOAN_REPOSITORY) private readonly loans: LoanRepositoryPort) {}

  async execute(input: ListMyLoansInput): Promise<ListMyLoansOutput> {
    const { items, total } = await this.loans.list({
      userId: input.userId,
      status: input.status,
      page: input.page,
      pageSize: input.pageSize,
    });
    return {
      items: items.map(toLoanResponse),
      page: input.page,
      pageSize: input.pageSize,
      total,
    };
  }
}
