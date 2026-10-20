// The tutor's replies, as plain React: paragraphs, numbered and bulleted lists, bold, and code.
// Never HTML from the reply itself.

import type { ReactNode } from "react";

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let at = 0, m: RegExpExecArray | null, i = 0;
  while ((m = re.exec(text))) {
    if (m.index > at) out.push(text.slice(at, m.index));
    const t = m[0];
    out.push(t.startsWith("**") ? <b key={`${key}-${i++}`}>{t.slice(2, -2)}</b> : <code key={`${key}-${i++}`} className="mono" style={{ fontSize: "0.92em" }}>{t.slice(1, -1)}</code>);
    at = m.index + t.length;
  }
  if (at < text.length) out.push(text.slice(at));
  return out;
}

export function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  const lines = text.replace(/\r/g, "").split("\n");
  let i = 0, k = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (/^\s*([-*•])\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*•])\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*([-*•])\s+/, ""));
      blocks.push(<ul key={k++} style={{ margin: "4px 0 8px", paddingLeft: 22 }}>{items.map((t, j) => <li key={j}>{inline(t, `${k}-${j}`)}</li>)}</ul>);
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+[.)]\s+/, ""));
      blocks.push(<ol key={k++} style={{ margin: "4px 0 8px", paddingLeft: 24 }}>{items.map((t, j) => <li key={j}>{inline(t, `${k}-${j}`)}</li>)}</ol>);
      continue;
    }
    if (/^#{1,4}\s+/.test(line)) { blocks.push(<p key={k++} style={{ margin: "8px 0 4px" }}><b>{line.replace(/^#{1,4}\s+/, "")}</b></p>); i++; continue; }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^\s*([-*•]|\d+[.)])\s+/.test(lines[i]) && !/^#{1,4}\s+/.test(lines[i])) para.push(lines[i++]);
    blocks.push(<p key={k++} style={{ margin: "0 0 8px" }}>{para.flatMap((p, j) => (j ? [<br key={`br${j}`} />, ...inline(p, `${k}-${j}`)] : inline(p, `${k}-${j}`)))}</p>);
  }
  return <div className="reading" style={{ fontSize: 17, lineHeight: 1.55, maxWidth: "none" }}>{blocks}</div>;
}
