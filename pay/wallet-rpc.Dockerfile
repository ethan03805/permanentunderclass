# monero-wallet-rpc from the official release, checked against a pinned SHA-256.
# To upgrade: take the new version and its linux-x64 hash from
# https://www.getmonero.org/downloads/hashes.txt (verify its GPG signature first),
# then change both ARGs below.
FROM debian:trixie-slim

ARG MONERO_VERSION=v0.18.5.4
ARG MONERO_SHA256=ba2928962c101b609434bf8c1b43ad59ebe96c5525977284ca599d8bf0f02d10

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl bzip2 \
 && rm -rf /var/lib/apt/lists/* \
 && curl -fsSL -o /tmp/monero.tar.bz2 "https://downloads.getmonero.org/cli/monero-linux-x64-${MONERO_VERSION}.tar.bz2" \
 && echo "${MONERO_SHA256}  /tmp/monero.tar.bz2" | sha256sum -c - \
 && tar -xjf /tmp/monero.tar.bz2 -C /tmp \
 && install -m 0755 /tmp/monero-x86_64-linux-gnu-*/monero-wallet-rpc /usr/local/bin/ \
 && rm -rf /tmp/monero* \
 && useradd --system --create-home monero \
 && mkdir /wallet \
 && chown monero /wallet

COPY --chmod=0755 wallet-rpc-entrypoint.sh /usr/local/bin/wallet-rpc-entrypoint.sh

USER monero
VOLUME /wallet
ENTRYPOINT ["/usr/local/bin/wallet-rpc-entrypoint.sh"]
