#!/bin/sh
# Сборка и выкладка в папку предпросмотра
cd "$(dirname "$0")" && npx vite build >/dev/null && rm -rf ~/.claude-previews/progress-app && mkdir -p ~/.claude-previews/progress-app && cp -R dist/. ~/.claude-previews/progress-app/ && echo deployed
