# PBX Platform Asterisk — pinned Asterisk 20 (andrius/asterisk)
FROM andrius/asterisk:20

USER root

RUN apt-get update && apt-get install -y --no-install-recommends curl bash jq \
  && rm -rf /var/lib/apt/lists/*

# Copy to overlay path — NOT /etc/asterisk (base image declares VOLUME there; Compose auto-binds COPY source)
COPY config/ /opt/pbx-asterisk/overlay/
COPY entrypoint.sh /entrypoint.sh
COPY healthcheck.sh /healthcheck.sh

RUN chmod +x /entrypoint.sh /healthcheck.sh \
  && mkdir -p /opt/pbx-asterisk/overlay

VOLUME ["/etc/asterisk/pbx-generated"]

EXPOSE 5060/udp 8088

HEALTHCHECK --interval=10s --timeout=5s --start-period=40s --retries=5 \
  CMD ["/healthcheck.sh"]

ENTRYPOINT ["/entrypoint.sh"]
