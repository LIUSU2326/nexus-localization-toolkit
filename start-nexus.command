#!/bin/zsh

cd "$(dirname "$0")"

if [ -f "$HOME/.cargo/env" ]; then
  source "$HOME/.cargo/env"
fi

echo "Starting NEXUS Localization Toolkit..."
echo "Project: $(pwd)"
echo

npm run desktop

echo
echo "NEXUS has stopped. You can close this window."
read -k 1 "?Press any key to close..."
