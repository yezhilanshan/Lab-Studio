const absolutePath = /(?:[A-Za-z]:[\\/]|\/(?:Users|home)\/)[^。；\n]*/g;

function shorten(value: string) {
  const parts = value.split(/[\\/]+/).filter(Boolean);
  return parts.length > 2 ? '…/' + parts.slice(-2).join('/') : value;
}

export function maskPath(value: unknown): string {
  return String(value ?? '').replace(absolutePath, (match) => {
    const trailing = match.match(/[。；,，]+$/)?.[0] ?? '';
    const path = trailing ? match.slice(0, -trailing.length) : match;
    return shorten(path) + trailing;
  });
}
