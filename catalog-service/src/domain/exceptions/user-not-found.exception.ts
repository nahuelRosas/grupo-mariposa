import { DomainException } from './domain.exception';

export class UserNotFoundException extends DomainException {
  constructor(id: string) {
    super(`User ${id} not found`, 'user_not_found');
  }
}
