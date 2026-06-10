FROM golang:1.23-alpine AS build
WORKDIR /src
COPY go.mod ./
COPY main.go ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /rating-engine .

FROM alpine:3.20
RUN addgroup -g 1001 pbx && adduser -u 1001 -G pbx -s /sbin/nologin -D pbx
USER pbx
COPY --from=build /rating-engine /usr/local/bin/rating-engine
EXPOSE 8092
HEALTHCHECK --interval=15s --timeout=3s --retries=5 \
  CMD wget -qO- http://127.0.0.1:8092/health/live || exit 1
CMD ["rating-engine"]
