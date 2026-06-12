export type LoanStatus = 'PENDING' | 'ACTIVE' | 'ROLLED_BACK';

export class Loan {
  constructor(
    public readonly id: string,
    public readonly remoteLoanId: string | null,
    public readonly userId: string,
    public readonly bookId: string,
    public readonly status: LoanStatus,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}
}
