# Analyzer worker image for Cloudflare Containers (and anywhere else).
# Build context: the analyzer/ directory.
FROM golang:1.27-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/csky-worker ./cmd/worker \
 && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/csky ./cmd/csky

FROM alpine:3.21
RUN apk add --no-cache git ca-certificates \
 && adduser -D -u 10001 csky \
 && git config --system protocol.file.allow never \
 && git config --system core.hooksPath /dev/null
USER csky
COPY --from=build /out/csky-worker /usr/local/bin/csky-worker
COPY --from=build /out/csky /usr/local/bin/csky
ENV PORT=8080 GIT_TERMINAL_PROMPT=0
EXPOSE 8080
ENTRYPOINT ["csky-worker"]
