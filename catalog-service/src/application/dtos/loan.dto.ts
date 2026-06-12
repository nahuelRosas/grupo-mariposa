import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateLoanDto {
  @ApiProperty({ description: 'UUID of the book to loan' })
  @IsUUID('all')
  bookId!: string;

  @ApiPropertyOptional({
    description:
      'Client-supplied dedup key. If a previous request with the same key succeeded, ' +
      'the loan is replayed instead of creating a duplicate. Recommended for mobile clients ' +
      'where retries on flaky networks are common.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  idempotencyKey?: string;
}

export class ListLoansQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  pageSize?: number = 20;

  @ApiPropertyOptional({ enum: ['PENDING', 'ACTIVE', 'ROLLED_BACK'] })
  @IsOptional()
  status?: 'PENDING' | 'ACTIVE' | 'ROLLED_BACK';

  @ApiPropertyOptional({ description: 'Filter by user (admin only)' })
  @IsOptional()
  @IsUUID('all')
  userId?: string;

  @ApiPropertyOptional({ description: 'Filter by book (admin only)' })
  @IsOptional()
  @IsUUID('all')
  bookId?: string;
}
