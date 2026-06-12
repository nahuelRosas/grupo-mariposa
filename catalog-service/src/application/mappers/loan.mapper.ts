import { Loan } from '../../domain/entities/loan.entity';

export interface LoanResponseDto {
  id: string;
  remoteLoanId: string | null;
  userId: string;
  bookId: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export const toLoanResponse = (l: Loan): LoanResponseDto => ({
  id: l.id,
  remoteLoanId: l.remoteLoanId,
  userId: l.userId,
  bookId: l.bookId,
  status: l.status,
  createdAt: l.createdAt,
  updatedAt: l.updatedAt,
});
