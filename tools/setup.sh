#!/usr/bin/env bash
# One-time setup in a fresh workspace: node deps, voice model (from GitHub releases), python deps.
set -e
cd "$(dirname "$0")/.."
npm i --silent
pip install -q --break-system-packages kokoro-onnx soundfile numpy 2>/dev/null || pip install -q kokoro-onnx soundfile numpy
mkdir -p models
for f in kokoro-v1.0.int8.onnx voices-v1.0.bin; do
  [ -s "models/$f" ] || curl -sL -o "models/$f" "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/$f"
done
echo "setup ok"
