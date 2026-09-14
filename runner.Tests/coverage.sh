#!/usr/bin/env bash
# Coverage gate for the runner: 100% line and branch coverage of Unmanaged.Runner.
#
#   runner.Tests/coverage.sh               # local: Linux container + this machine
#   runner.Tests/coverage.sh --linux-only  # CI: two Linux containers, no host .NET needed
#
# The runner takes different paths depending on the platform. On Linux,
# programs run under ulimits inside a setsid session and the whole process
# group is killed at the end. Without /usr/bin/setsid (macOS) they don't. Both
# paths matter, so the suite runs twice for real and the results are merged
# before the threshold is checked:
#
#   1. In a Linux container, as the non-root `app` user like
#      docker/runner.Dockerfile. Sources are copied to the same absolute path
#      as on the host so the reports line up.
#   2. Locally: on this machine (macOS has no /usr/bin/setsid), merged with 1.
#      With --linux-only: in a second container with setsid removed.
#
# Needs Docker, plus the .NET 10 SDK for the local mode. Reports land in coverage/runner/.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/coverage/runner"
IMAGE="mcr.microsoft.com/dotnet/sdk:10.0"
MODE="${1:-local}"
export DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_NOLOGO=1

THRESHOLD_ARGS=(
  '-p:CoverletOutputFormat="json,cobertura,opencover"'
  -p:Threshold=100
  '-p:ThresholdType="line,branch"'
  -p:ThresholdStat=Total
)

rm -rf "$OUT"
mkdir -p "$OUT/linux"
chmod -R 0777 "$OUT"

# run_in_container <label> <remove-setsid: 0|1> <dotnet test arguments...>
run_in_container() {
  local label="$1" remove_setsid="$2"
  shift 2
  echo "==> $label"
  docker run --rm --init \
    -v "$ROOT/runner:/mnt/src/runner:ro" \
    -v "$ROOT/runner.Tests:/mnt/src/runner.Tests:ro" \
    -v "$OUT:$OUT" \
    -v unmanaged-runner-tests-nuget:/home/app/.nuget/packages \
    -e DOTNET_CLI_TELEMETRY_OPTOUT=1 -e DOTNET_NOLOGO=1 \
    -e ROOT="$ROOT" -e REMOVE_SETSID="$remove_setsid" \
    "$IMAGE" sh -euc '
      mkdir -p "$ROOT"
      for project in runner runner.Tests; do
        cp -r "/mnt/src/$project" "$ROOT/"
        rm -rf "$ROOT/$project/bin" "$ROOT/$project/obj" "$ROOT/$project/TestResults"
      done
      chown -R app:app "$ROOT"
      chown app:app /home/app/.nuget /home/app/.nuget/packages
      if [ "$REMOVE_SETSID" = 1 ]; then rm -f /usr/bin/setsid; fi
      exec setpriv --reuid=app --regid=app --init-groups env HOME=/home/app \
        dotnet test "$ROOT/runner.Tests" "$@"
    ' sh "$@"
}

run_in_container "Linux with setsid ($IMAGE)" 0 \
  -p:CollectCoverage=true -p:CoverletOutputFormat=json -p:CoverletOutput="$OUT/linux/"

case "$MODE" in
  --linux-only)
    run_in_container "Linux without setsid, merged, threshold 100% line and branch" 1 \
      -p:CollectCoverage=true -p:MergeWith="$OUT/linux/coverage.json" -p:CoverletOutput="$OUT/" "${THRESHOLD_ARGS[@]}"
    ;;
  local)
    echo "==> $(uname -s), merged with Linux, threshold 100% line and branch"
    dotnet test "$ROOT/runner.Tests" \
      -p:CollectCoverage=true -p:MergeWith="$OUT/linux/coverage.json" -p:CoverletOutput="$OUT/" "${THRESHOLD_ARGS[@]}"
    ;;
  *)
    echo "usage: $0 [--linux-only]" >&2
    exit 2
    ;;
esac
