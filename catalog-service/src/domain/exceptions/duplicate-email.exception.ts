import { DomainException } from './domain.exception';

export class DuplicateEmailException extends DomainException {
  constructor(email: string) {
    super(`User with email ${email} already exists`, 'duplicate_email');
  }
}
