#!/bin/sh
set -eu
# A concrete address is required: mapping external loopback to 0.0.0.0 is invalid.
relay_ip="$(hostname -i)"
relay_ip="${relay_ip%% *}"
exec turnserver -c /opt/clikiss/turn-test.conf --relay-ip="$relay_ip"
