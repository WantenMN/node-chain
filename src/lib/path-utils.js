export function pathKey(path) {
  return path.join(",");
}

export function pathStartsWith(path, prefix) {
  if (prefix.length > path.length) return false;
  return prefix.every((id, i) => id === path[i]);
}
