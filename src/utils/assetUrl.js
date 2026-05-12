/** Public-folder URLs that work on `/` (local) and GitHub Pages (`/repo/`). */
export function assetUrl(path) {
  const trimmed = path.startsWith('/') ? path.slice(1) : path;
  return `${import.meta.env.BASE_URL}${trimmed}`;
}
