import { NextResponse } from 'next/server';
import { SAMPLE_PAGES, buildScannedPage } from '@/data/samplePages';
import type { ScannedElement, ScannedPage } from '@/lib/types';

function countsFrom(elements: ScannedElement[]) {
  return {
    total: elements.length,
    buttons: elements.filter((e) => e.tag === 'button').length,
    inputs: elements.filter((e) => e.tag === 'input' || e.tag === 'select' || e.tag === 'textarea').length,
    forms: 1,
    links: elements.filter((e) => e.tag === 'a').length,
    headings: elements.filter((e) => /^h[1-6]$/i.test(e.tag) || e.category === 'content').length,
  };
}

function attr(raw: string, name: string): string | undefined {
  const match = raw.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, 'i'));
  return match?.[1];
}

function parseHtml(html: string, url: string): ScannedPage {
  const elements: ScannedElement[] = [];
  const tagRe = /<(button|input|select|textarea|a|h[1-6])(\s[^>]*)?>/gi;
  let match: RegExpExecArray | null;
  let i = 0;

  while ((match = tagRe.exec(html)) !== null) {
    i += 1;
    const tag = match[1].toLowerCase();
    const attrs = match[2] || '';
    const id = attr(attrs, 'id');
    const name = attr(attrs, 'name') || attr(attrs, 'placeholder') || tag;
    const type = attr(attrs, 'type') || tag;
    const placeholder = attr(attrs, 'placeholder');
    const selector = id ? `#${id}` : name !== tag ? `[name="${name}"]` : `${tag}:nth-of-type(${i})`;
    const category =
      tag === 'button' ? 'action' :
      tag === 'a' ? 'navigation' :
      tag === 'input' || tag === 'select' || tag === 'textarea' ? 'input' :
      'content';

    elements.push({
      id: `elem-html-${i}`,
      tag,
      type,
      name,
      selector,
      placeholder,
      isInteractive: ['button', 'input', 'select', 'textarea', 'a'].includes(tag),
      category,
      required: /\srequired(\s|=|>|$)/i.test(attrs),
    });
  }

  return {
    url,
    title: url.replace(/^https?:\/\//, '').split('/')[0] || 'Custom markup',
    description: `Parsed ${elements.length} interactive nodes from pasted HTML.`,
    scannedAt: new Date().toISOString(),
    elements,
    counts: countsFrom(elements),
    rawHtml: html,
    sampleKey: 'custom',
  };
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const url = typeof body.url === 'string' ? body.url : '';
  const rawHtml = typeof body.rawHtml === 'string' ? body.rawHtml : '';

  if (rawHtml.trim()) {
    return NextResponse.json(parseHtml(rawHtml, url || 'custom-markup.local'));
  }

  const sample =
    SAMPLE_PAGES.find((s) => s.defaultUrl === url) ||
    SAMPLE_PAGES.find((s) => url.includes(s.id)) ||
    SAMPLE_PAGES[0];

  return NextResponse.json(buildScannedPage(sample.id));
}
