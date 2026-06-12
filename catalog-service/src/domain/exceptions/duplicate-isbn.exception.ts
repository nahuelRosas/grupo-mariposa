import { DomainException } from './domain.exception';

export class DuplicateIsbnException extends DomainException {
  constructor(isbn: string) {
    super(`Book with ISBN ${isbn} already exists`, 'duplicate_isbn');
  }
}
