export interface CreateRemoteLoanRequest {
  userId: string;
  bookId: string;
  isbn: string;
  idempotencyKey: string;
}

export interface CreateRemoteLoanResponse {
  loanId: string;
  status: 'ACTIVE' | 'PENDING';
  borrowedAt: string;
}

export interface RegisterReturnInput {
  loanId: string;
}

export interface RegisterReturnResponse {
  loanId: string;
  status: string;
  returnedAt: string;
  message?: string;
}

export interface AvailabilityResponse {
  exists: boolean;
  available: boolean;
  availableStock: number;
  totalStock: number;
}

export interface LoanServicePort {
  createLoan(req: CreateRemoteLoanRequest): Promise<CreateRemoteLoanResponse>;
  registerReturn(input: RegisterReturnInput): Promise<RegisterReturnResponse>;
  checkAvailability(bookId: string): Promise<AvailabilityResponse>;
}
