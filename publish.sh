#!/bin/sh
# Публикация новой версии на GitHub Pages: тесты → сборка → ветка gh-pages
set -e
cd "$(dirname "$0")"
npx tsc -p tsconfig.json
npx vitest run
npx vite build
D=$(mktemp -d)
cp -R dist/. "$D/"
touch "$D/.nojekyll"
cd "$D"
git init -q -b gh-pages
git add -A
git -c user.name="maksim93-web" -c user.email="maksim93-web@users.noreply.github.com" commit -q -m "Deploy $(date '+%Y-%m-%d %H:%M')"
git push -q -f https://github.com/maksim93-web/progress-app.git gh-pages
echo "Опубликовано: https://maksim93-web.github.io/progress-app/"
