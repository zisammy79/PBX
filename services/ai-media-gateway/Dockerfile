FROM golang:1.24-alpine AS builder
WORKDIR /src
COPY go.mod ./
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /ai-media-gateway .

FROM alpine:3.20
RUN apk add --no-cache ca-certificates
WORKDIR /app
COPY --from=builder /ai-media-gateway /app/ai-media-gateway
EXPOSE 8091
USER nobody
ENTRYPOINT ["/app/ai-media-gateway"]
