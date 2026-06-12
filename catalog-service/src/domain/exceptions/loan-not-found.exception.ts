import { DomainException } from './domain.exception';

export class LoanNotFoundException extends DomainException {
  constructor(id: string) {
    super(`Loan ${id} not found`, 'loan_not_found');
  }
}
