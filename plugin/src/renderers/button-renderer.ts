import { ButtonConfig } from '../layout-manager.js';

const SIZE = 144; // Stream Deck+ high DPI

export function renderButton(config: ButtonConfig): string {
  const textOpacity = config.enabled ? '1' : '0.4';

  // Badge + title
  const displayTitle = config.badge ? `${config.badge} ${config.title}` : config.title;

  // 2-line layout: title (bold, larger) + subtitle (regular, smaller)
  if (config.subtitle) {
    const mainFontSize = displayTitle.length > 9 ? 20 : 24;
    const subFontSize = 14;
    const titleLines = wrapText(displayTitle, mainFontSize <= 20 ? 13 : 11);
    const subLines = wrapText(config.subtitle, 16);

    const totalHeight = titleLines.length * (mainFontSize + 4) + subLines.length * (subFontSize + 2) + 8;
    const startY = Math.max(30, (SIZE - totalHeight) / 2 + mainFontSize);

    let y = startY;
    const elements: string[] = [];
    for (const line of titleLines) {
      elements.push(`<text x="72" y="${y}" text-anchor="middle" font-family="Arial,sans-serif" font-size="${mainFontSize}" font-weight="bold" fill="${config.textColor}" opacity="${textOpacity}">${escapeXml(line)}</text>`);
      y += mainFontSize + 4;
    }
    y += 4; // gap between title and subtitle
    for (const line of subLines) {
      elements.push(`<text x="72" y="${y}" text-anchor="middle" font-family="Arial,sans-serif" font-size="${subFontSize}" fill="${config.textColor}" opacity="0.6">${escapeXml(line)}</text>`);
      y += subFontSize + 2;
    }

    return svgFrame(config.color, elements.join(''), config.slotNumber);
  }

  // Single-text layout with adaptive font size
  const fontSize = displayTitle.length > 12 ? 20 : displayTitle.length > 8 ? 24 : 28;
  const maxChars = fontSize <= 20 ? 13 : fontSize <= 24 ? 11 : 9;
  const lines = wrapText(displayTitle, maxChars);
  const lineHeight = fontSize + 8;
  const startY = lines.length === 1 ? 84 : 84 - ((lines.length - 1) * lineHeight) / 2;

  const textElements = lines
    .map(
      (line, i) =>
        `<text x="72" y="${startY + i * lineHeight}" text-anchor="middle" font-family="Arial,sans-serif" font-size="${fontSize}" font-weight="bold" fill="${config.textColor}" opacity="${textOpacity}">${escapeXml(line)}</text>`,
    )
    .join('');

  return svgFrame(config.color, textElements, config.slotNumber);
}

function svgFrame(bgColor: string, innerElements: string, slotNumber?: number): string {
  const slotLabel = slotNumber != null
    ? `<text x="${SIZE - 10}" y="18" text-anchor="end" font-family="Arial,sans-serif" font-size="13" fill="#ffffff" opacity="0.3">${slotNumber}</text>`
    : '';
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">`,
    `<rect width="${SIZE}" height="${SIZE}" rx="12" fill="${bgColor}"/>`,
    innerElements,
    slotLabel,
    `</svg>`,
  ].join('');
}

export function svgToDataUrl(svg: string): string {
  // Official SD SDK pattern: data:image/svg+xml,{encodeURIComponent}
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function wrapText(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];

  // Split into tokens: spaces, hyphens, underscores, and camelCase boundaries
  const tokens = tokenize(text);

  const lines: string[] = [];
  let current = '';
  for (const token of tokens) {
    if (current.length + token.length > maxChars) {
      if (current) lines.push(current);
      current = token;
    } else {
      current += token;
    }
  }
  if (current) lines.push(current);

  // Hard-break any line still exceeding maxChars
  const result: string[] = [];
  for (const line of lines) {
    if (line.length <= maxChars) {
      result.push(line);
    } else {
      for (let i = 0; i < line.length; i += maxChars) {
        result.push(line.slice(i, i + maxChars));
      }
    }
  }
  return result;
}

/** Split text into wrap-friendly tokens at spaces, hyphens, underscores, and camelCase boundaries */
function tokenize(text: string): string[] {
  const tokens: string[] = [];
  let buf = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    // Break after space, hyphen, underscore (keep delimiter with preceding token)
    if (ch === ' ' || ch === '-' || ch === '_') {
      buf += ch;
      tokens.push(buf);
      buf = '';
    }
    // camelCase boundary: lowercase followed by uppercase
    else if (
      buf.length > 0 &&
      ch >= 'A' && ch <= 'Z' &&
      buf[buf.length - 1] >= 'a' && buf[buf.length - 1] <= 'z'
    ) {
      tokens.push(buf);
      buf = ch;
    } else {
      buf += ch;
    }
  }
  if (buf) tokens.push(buf);
  return tokens;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
