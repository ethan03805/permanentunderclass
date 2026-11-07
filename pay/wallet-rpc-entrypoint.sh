#!/bin/sh
# Starts monero-wallet-rpc for the pay service. It listens only on the compose
# network (no port is published) and holds a view-only wallet in /wallet.
set -eu

case "${MONERO_NETWORK:-mainnet}" in
  mainnet) network="" ;;
  stagenet) network="--stagenet" ;;
  *) echo "MONERO_NETWORK must be mainnet or stagenet" >&2; exit 1 ;;
esac

: "${MONERO_DAEMON:?set MONERO_DAEMON to host:port of a Monero node}"

# shellcheck disable=SC2086  # $network and $MONERO_EXTRA_ARGS are meant to split
exec monero-wallet-rpc $network \
  --daemon-address "$MONERO_DAEMON" \
  --wallet-dir /wallet \
  --rpc-bind-ip 0.0.0.0 \
  --rpc-bind-port 18083 \
  --confirm-external-bind \
  --disable-rpc-login \
  --log-file /tmp/monero-wallet-rpc.log \
  ${MONERO_EXTRA_ARGS:-}
