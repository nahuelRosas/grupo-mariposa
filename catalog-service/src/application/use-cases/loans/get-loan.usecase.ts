import { Inject, Injectable } from '@nestjs/common';
import { LOAN_REPOSITORY } from '../../../shared/di-tokens/tokens';
import { LoanRepositoryPort } from '../../../domain/ports/loan-repository.port';
import { toLoanResponse, LoanResponseDto } from '../../mappers/loan.mapper';
import { LoanNotFoundException } from '../../../domain/exceptions/loan-not-found.exception';

@Injectable()
export class GetLoanUseCase {
  constructor(@Inject(LOAN_REPOSITORY) private readonly loans: LoanRepositoryPort) {}

  async execute(id: string): Promise<LoanResponseDto> {
    const loan = await this.loans.findById(id);
    if (!loan) throw new LoanNotFoundException(id);
    return toLoanResponse(loan);
  }
}
