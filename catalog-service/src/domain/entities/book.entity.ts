export class Book {
  constructor(
    public readonly id: string,
    public readonly isbn: string,
    public readonly title: string,
    public readonly author: string,
    public readonly publisher: string | null,
    public readonly publishedYear: number | null,
    public readonly genre: string | null,
    public readonly totalStock: number,
    public readonly availableStock: number,
    public readonly description: string | null,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}

  hasStock(qty = 1): boolean {
    return this.availableStock >= qty;
  }
}
