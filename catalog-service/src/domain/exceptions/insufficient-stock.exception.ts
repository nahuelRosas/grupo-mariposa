import { DomainException } from './domain.exception';

export class InsufficientStockException extends DomainException {
  constructor(bookId: string) {
    super(`Book ${bookId} has insufficient stock`, 'insufficient_stock');
  }
}
