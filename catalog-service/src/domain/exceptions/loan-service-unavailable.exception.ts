import { DomainException } from './domain.exception';

export class LoanServiceUnavailableException extends DomainException {
  constructor(public readonly cause: unknown) {
    super('Loan service is unavailable; local change was reverted', 'loan_service_unavailable');
  }
}
