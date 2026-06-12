import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { GetBookUseCase } from '../../application/use-cases/books/get-book.usecase';
import { Public } from '../../shared/decorators/public.decorator';

@ApiTags('internal')
@Controller('internal/books')
export class InternalBooksController {
  constructor(private readonly getBook: GetBookUseCase) {}

  @Public()
  @Get(':id')
  @ApiOperation({
    summary: 'Book availability (service-to-service, no auth)',
    description:
      'Returns only the fields Loan Service needs to validate a loan: id, availableStock, totalStock. Throws BookNotFoundException (mapped to 404) when the book does not exist.',
  })
  @ApiResponse({ status: 200, description: 'Book availability' })
  @ApiResponse({ status: 404, description: 'Book not found' })
  async availability(@Param('id') id: string) {
    const book = await this.getBook.execute(id);
    return {
      id: book.id,
      availableStock: book.availableStock,
      totalStock: book.totalStock,
    };
  }
}
