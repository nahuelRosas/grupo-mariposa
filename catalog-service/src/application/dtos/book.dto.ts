import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateBookDto {
  @ApiProperty({ example: '978-0-13-468599-1' })
  @IsString()
  @IsNotEmpty()
  @Length(10, 20)
  isbn!: string;

  @ApiProperty({ example: 'The Pragmatic Programmer' })
  @IsString()
  @IsNotEmpty()
  @Length(1, 255)
  title!: string;

  @ApiProperty({ example: 'Andrew Hunt' })
  @IsString()
  @IsNotEmpty()
  @Length(1, 255)
  author!: string;

  @ApiPropertyOptional({ example: 'Addison-Wesley' })
  @IsOptional()
  @IsString()
  @Length(1, 255)
  publisher?: string;

  @ApiPropertyOptional({ example: 1999 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(new Date().getFullYear())
  publishedYear?: number;

  @ApiPropertyOptional({ example: 'Software Engineering' })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  genre?: string;

  @ApiProperty({ example: 5, minimum: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  totalStock!: number;

  @ApiPropertyOptional({ example: 'A book about pragmatic software development.' })
  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateBookDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 255)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 255)
  author?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 255)
  publisher?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(new Date().getFullYear())
  publishedYear?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 100)
  genre?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  totalStock?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}

export class ListBooksQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;

  @ApiPropertyOptional({ description: 'Search across title/author/isbn' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  author?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  genre?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  availability?: boolean;
}
