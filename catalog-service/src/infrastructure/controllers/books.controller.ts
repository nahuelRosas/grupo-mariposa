import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../adapters/security/jwt-auth.guard';
import { RolesGuard } from '../adapters/security/roles.guard';
import { Roles } from '../adapters/security/roles.decorator';
import { Role } from '../../shared/types/role.enum';
import { CreateBookDto, UpdateBookDto, ListBooksQueryDto } from '../../application/dtos/book.dto';
import { CreateBookUseCase } from '../../application/use-cases/books/create-book.usecase';
import { GetBookUseCase } from '../../application/use-cases/books/get-book.usecase';
import { ListBooksUseCase } from '../../application/use-cases/books/list-books.usecase';
import { UpdateBookUseCase } from '../../application/use-cases/books/update-book.usecase';
import { DeleteBookUseCase } from '../../application/use-cases/books/delete-book.usecase';

@ApiTags('books')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('books')
export class BooksController {
  constructor(
    private readonly createBook: CreateBookUseCase,
    private readonly getBook: GetBookUseCase,
    private readonly listBooks: ListBooksUseCase,
    private readonly updateBook: UpdateBookUseCase,
    private readonly deleteBook: DeleteBookUseCase,
  ) {}

  @Post()
  @Roles(Role.ADMIN)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Create a book (admin only, rate-limited)' })
  @ApiResponse({ status: 201 })
  @ApiResponse({ status: 409, description: 'Duplicate ISBN' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  create(@Body() dto: CreateBookDto) {
    return this.createBook.execute(dto);
  }

  @Get()
  @Roles(Role.ADMIN, Role.USER)
  @ApiOperation({ summary: 'List books (paginated, optional search)' })
  list(@Query() q: ListBooksQueryDto) {
    return this.listBooks.execute({
      page: q.page ?? 1,
      pageSize: q.pageSize ?? 20,
      search: q.search,
      author: q.author,
      genre: q.genre,
      availability: q.availability,
    });
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.USER)
  @ApiOperation({ summary: 'Get one book' })
  getOne(@Param('id') id: string) {
    return this.getBook.execute(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update a book (admin only)' })
  update(@Param('id') id: string, @Body() dto: UpdateBookDto) {
    return this.updateBook.execute({ id, patch: dto });
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Delete a book (admin only)' })
  async remove(@Param('id') id: string) {
    await this.deleteBook.execute(id);
    return { deleted: true };
  }
}
