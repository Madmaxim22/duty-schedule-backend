#!/bin/sh
# Устарело: cAdvisor не работает на OMV + containerd snapshotter.
echo "Используйте: sh scripts/verify-docker-metrics.sh"
exec sh "$(dirname "$0")/verify-docker-metrics.sh"
