FROM alpine:3.22

ARG PB_VERSION=0.40.0
ARG TARGETARCH=amd64

RUN apk add --no-cache ca-certificates unzip wget

WORKDIR /pb

RUN set -eux; \
    case "${TARGETARCH}" in amd64|arm64) ;; *) echo "Unsupported architecture: ${TARGETARCH}"; exit 1 ;; esac; \
    archive="pocketbase_${PB_VERSION}_linux_${TARGETARCH}.zip"; \
    base_url="https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}"; \
    wget -q "${base_url}/${archive}" -O "${archive}"; \
    wget -q "${base_url}/checksums.txt" -O checksums.txt; \
    grep " ${archive}$" checksums.txt > archive.sha256; \
    sha256sum -c archive.sha256; \
    unzip "${archive}"; \
    rm "${archive}" checksums.txt archive.sha256

COPY pb_migrations /pb/pb_migrations
COPY pb_hooks /pb/pb_hooks
COPY docker/pocketbase-entrypoint.sh /pb/pocketbase-entrypoint.sh
RUN sed -i 's/\r$//' /pb/pocketbase-entrypoint.sh && chmod +x /pb/pocketbase-entrypoint.sh

EXPOSE 8090

ENTRYPOINT ["/pb/pocketbase-entrypoint.sh"]
