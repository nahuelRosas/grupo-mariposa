import { DomainException } from './domain.exception';

export class BookNotFoundException extends DomainException {
  constructor(id: string) {
    super(`Book ${id} not found`, 'book_not_found');
  }
}
