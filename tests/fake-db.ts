// Minimal in-memory stand-in for the supabase-js query builder, covering the
// calls the shared publish flow makes. Each query executes when awaited, so
// concurrent callers interleave the way real network round-trips do.

type Row = Record<string, unknown>

export class FakeDb {
  tables: Record<string, Row[]>

  constructor(tables: Record<string, Row[]>) {
    this.tables = tables
  }

  from(table: string) {
    return new FakeQuery(this, table)
  }
}

class FakeQuery implements PromiseLike<{ data: unknown; error: null }> {
  private op: 'select' | 'update' | 'insert' | null = null
  private values: Row = {}
  private filters: Array<(row: Row) => boolean> = []
  private returning = false
  private single = false

  constructor(
    private db: FakeDb,
    private table: string
  ) {}

  select() {
    if (!this.op) this.op = 'select'
    this.returning = true
    return this
  }
  update(values: Row) {
    this.op = 'update'
    this.values = values
    return this
  }
  insert(values: Row) {
    this.op = 'insert'
    this.values = values
    return this
  }
  eq(col: string, value: unknown) {
    this.filters.push((r) => r[col] === value)
    return this
  }
  lt(col: string, value: string) {
    this.filters.push((r) => String(r[col]) < value)
    return this
  }
  maybeSingle() {
    this.single = true
    return this
  }

  private exec() {
    const rows = (this.db.tables[this.table] ??= [])
    if (this.op === 'insert') {
      rows.push({ ...this.values })
      return { data: null, error: null }
    }

    const matched = rows.filter((r) => this.filters.every((f) => f(r)))
    if (this.op === 'update') {
      matched.forEach((r) => Object.assign(r, this.values))
      return { data: this.returning ? matched.map((r) => ({ ...r })) : null, error: null }
    }

    const out = matched.map((r) =>
      this.table === 'posts'
        ? { ...r, clients: this.db.tables.clients?.find((c) => c.id === r.client_id) ?? null }
        : { ...r }
    )
    return { data: this.single ? (out[0] ?? null) : out, error: null as null }
  }

  then<T1 = { data: unknown; error: null }, T2 = never>(
    onfulfilled?: ((value: { data: unknown; error: null }) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null
  ): PromiseLike<T1 | T2> {
    // Resolve on a later microtask, like a network call would.
    return Promise.resolve()
      .then(() => this.exec())
      .then(onfulfilled, onrejected)
  }
}
