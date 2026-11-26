// Initials avatar: the neutral fallback wherever a student has not uploaded a
// profile picture. A small data-URI SVG with the student's own initials, so
// every <img> that reads student.avatar keeps working with no placeholder
// photo anywhere.
export function initialsAvatar(name?: string | null): string {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  const initials =
    parts.slice(0, 2).map((p) => p[0]!.toUpperCase()).join('') || 'S';
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">' +
    '<rect width="200" height="200" fill="#1E293B"/>' +
    '<text x="100" y="106" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="72" font-weight="700" fill="#FFFFFF">' +
    initials +
    '</text></svg>';
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
