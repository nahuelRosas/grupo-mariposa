import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PRISMA_CLIENT } from '../../../shared/di-tokens/tokens';
import { UserRepositoryPort } from '../../../domain/ports/user-repository.port';
import { User } from '../../../domain/entities/user.entity';
import { Role } from '../../../shared/types/role.enum';

function rowToUser(row: {
  id: string;
  email: string;
  passwordHash: string;
  fullName: string;
  role: 'ADMIN' | 'USER';
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}): User {
  return new User(
    row.id,
    row.email,
    row.passwordHash,
    row.fullName,
    row.role as Role,
    row.isActive,
    row.createdAt,
    row.updatedAt,
  );
}

@Injectable()
export class PrismaUserRepository implements UserRepositoryPort {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { id } });
    return row ? rowToUser(row) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { email } });
    return row ? rowToUser(row) : null;
  }

  async create(user: User): Promise<User> {
    const row = await this.prisma.user.create({
      data: {
        email: user.email,
        passwordHash: user.passwordHash,
        fullName: user.fullName,
        role: user.role,
        isActive: user.isActive,
      },
    });
    return rowToUser(row);
  }

  async findAll(opts: { skip: number; take: number }): Promise<{ items: User[]; total: number }> {
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        skip: opts.skip,
        take: opts.take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count(),
    ]);
    return { items: rows.map(rowToUser), total };
  }

  async update(id: string, patch: Partial<User>): Promise<User> {
    const row = await this.prisma.user.update({
      where: { id },
      data: {
        ...(patch.fullName !== undefined ? { fullName: patch.fullName } : {}),
        ...(patch.role !== undefined ? { role: patch.role } : {}),
        ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
        ...(patch.passwordHash !== undefined ? { passwordHash: patch.passwordHash } : {}),
      },
    });
    return rowToUser(row);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.user.delete({ where: { id } });
  }
}
