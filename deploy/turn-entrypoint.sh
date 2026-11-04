#!/bin/sh
set -eu
umask 077
case "${TURN_PUBLIC_IP:-}" in ''|*[!0-9.]*) echo 'Set TURN_PUBLIC_IP to the public IPv4.' >&2; exit 1;; esac
case "${TURN_REALM:-}" in ''|*[!a-zA-Z0-9.-]*) echo 'Set TURN_REALM to a DNS name.' >&2; exit 1;; esac
case "${TURN_SHARED_SECRET:-}" in ''|*[!a-zA-Z0-9_-]*) echo 'Use a random hex/base64url TURN secret.' >&2; exit 1;; esac
[ "${#TURN_SHARED_SECRET}" -ge 32 ] || exit 1
case "${TURN_TOTAL_QUOTA:-120}" in *[!0-9]*) exit 1;; esac
case "${TURN_BPS_CAPACITY:-6250000}" in *[!0-9]*) exit 1;; esac
relay_ip="${TURN_RELAY_IP:-$(hostname -i)}"
relay_ip="${relay_ip%% *}"
case "$relay_ip" in ''|*[!0-9.]*) echo 'Could not determine the container relay IPv4.' >&2; exit 1;; esac
cat > /tmp/turnserver.conf <<EOF
listening-port=3478
listening-ip=0.0.0.0
relay-ip=${relay_ip}
external-ip=${TURN_PUBLIC_IP}
realm=${TURN_REALM}
fingerprint
use-auth-secret
static-auth-secret=${TURN_SHARED_SECRET}
min-port=49160
max-port=49559
total-quota=${TURN_TOTAL_QUOTA:-120}
user-quota=6
unauthorized-ratelimit
unauthorized-ratelimit-rps=10
max-bps=400000
bps-capacity=${TURN_BPS_CAPACITY:-6250000}
stale-nonce=600
max-allocate-timeout=30
no-tls
no-tcp-relay
no-multicast-peers
relay-threads=1
userdb=/tmp/turn.sqlite
no-software-attribute
denied-peer-ip=0.0.0.0-0.255.255.255
denied-peer-ip=10.0.0.0-10.255.255.255
denied-peer-ip=100.64.0.0-100.127.255.255
denied-peer-ip=127.0.0.0-127.255.255.255
denied-peer-ip=169.254.0.0-169.254.255.255
denied-peer-ip=172.16.0.0-172.31.255.255
denied-peer-ip=192.168.0.0-192.168.255.255
denied-peer-ip=224.0.0.0-255.255.255.255
denied-peer-ip=::1
denied-peer-ip=fc00::-fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff
denied-peer-ip=fe80::-febf:ffff:ffff:ffff:ffff:ffff:ffff:ffff
# Permit the relay's own concrete address for two allocations on this server.
allowed-peer-ip=${relay_ip}
log-file=stdout
simple-log
pidfile=/tmp/turnserver.pid
EOF
exec turnserver -c /tmp/turnserver.conf
