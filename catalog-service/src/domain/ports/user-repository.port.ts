import { User } from '../entities/user.entity';

export interface UserRepositoryPort {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  findAll(opts: { skip: number; take: number }): Promise<{ items: User[]; total: number }>;
  create(user: User): Promise<User>;
  update(id: string, patch: Partial<User>): Promise<User>;
  delete(id: string): Promise<void>;
}
