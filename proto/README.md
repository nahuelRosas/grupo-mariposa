# proto/

The canonical contract between catalog-service and loan-service.

`library.proto` is the source of truth. Both services
generate their own client/server stubs from it.

## Codegen

### Go (loan-service)

From the repo root:

```bash
mkdir -p loan-service/proto/gen
protoc \
  --go_out=loan-service/proto/gen \
  --go_opt=paths=source_relative \
  --go-grpc_out=loan-service/proto/gen \
  --go-grpc_opt=paths=source_relative \
  -I proto proto/library.proto
```

Or use the Makefile target in `loan-service/Makefile`:

```bash
cd loan-service && make proto
```

### TypeScript (catalog-service)

catalog-service loads the proto at runtime via `@grpc/proto-loader` — no
codegen step is required. The compiled JS bundle picks up
`../../proto/library.proto` relative to `catalog-service/src/`.

## Versioning

The package is `library.v1`. Breaking changes go to `library.v2`;
non-breaking additions to `v1` are backwards compatible.
