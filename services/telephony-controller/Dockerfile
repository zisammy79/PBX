FROM golang:1.24-alpine AS builder
WORKDIR /src
RUN apk add --no-cache git
COPY go.mod go.sum* ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /telephony-controller .

FROM alpine:3.20
RUN apk add --no-cache ca-certificates
WORKDIR /app
COPY --from=builder /telephony-controller /app/telephony-controller
EXPOSE 8090
USER nobody
ENTRYPOINT ["/app/telephony-controller"]
