export function postText(snapshot) {
  if (!snapshot) return '';
  const raw = typeof snapshot.fullText === 'string'
    ? snapshot.fullText
    : `${snapshot.text || ''}${snapshot.cardText ? `\n${snapshot.cardText}` : ''}`;
  return raw.replace(/[’‘]/g, "'");
}
