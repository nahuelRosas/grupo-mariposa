import { Loan } from '../entities/loan.entity';

export interface ListLoansFilter {
  userId?: string;
  bookId?: string;
  status?: 'PENDING' | 'ACTIVE' | 'ROLLED_BACK';
  page: number;
  pageSize: number;
}

export interface LoanRepositoryPort {
  findById(id: string): Promise<Loan | null>;
  findByRemoteLoanId(remoteLoanId: string): Promise<Loan | null>;
  list(filter: ListLoansFilter): Promise<{ items: Loan[]; total: number }>;
}
