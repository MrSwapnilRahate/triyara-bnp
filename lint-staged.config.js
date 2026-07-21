export default {
  '*.{ts,tsx}': ['eslint --fix --no-warn-ignored', 'prettier --write'],
  '*.{js,mjs,json,md,css,yml,yaml}': ['prettier --write'],
}
