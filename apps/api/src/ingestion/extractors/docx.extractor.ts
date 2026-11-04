import { Injectable } from '@nestjs/common';
import mammoth from 'mammoth';
import { JSDOM } from 'jsdom';
import { ExtractedDocument, ExtractedSection } from './pdf.extractor.js';

@Injectable()
export class DocxExtractor {
  async extract(buffer: Buffer): Promise<ExtractedDocument> {
    const result = await mammoth.convertToHtml({ buffer });
    const html = result.value;

    if (!html || html.trim().length === 0) {
      return {
        pageCount: undefined,
        sections: [],
      };
    }

    const dom = new JSDOM(html);
    const body = dom.window.document.body;
    const sections: ExtractedSection[] = [];

    const headingStack: Array<{ level: number; text: string }> = [];
    let currentSection: ExtractedSection | null = null;

    const children = Array.from(body.children);
    for (const child of children) {
      const tagName = child.tagName.toUpperCase();
      if (/^H[1-6]$/.test(tagName)) {
        const level = parseInt(tagName.slice(1), 10);
        const headingText = child.textContent?.trim() || '';

        // Maintain hierarchy stack
        while (headingStack.length > 0 && headingStack[headingStack.length - 1]!.level >= level) {
          headingStack.pop();
        }
        headingStack.push({ level, text: headingText });

        const headingPath = headingStack.map((h) => h.text).join(' > ');
        currentSection = {
          page: null,
          heading: headingText,
          headingPath,
          text: '',
        };
        sections.push(currentSection);
      } else {
        const text = child.textContent?.trim() || '';
        if (text.length > 0) {
          if (!currentSection) {
            currentSection = {
              page: null,
              heading: null,
              headingPath: null,
              text,
            };
            sections.push(currentSection);
          } else {
            currentSection.text = currentSection.text ? `${currentSection.text}\n\n${text}` : text;
          }
        }
      }
    }

    const nonEmptySections = sections.filter((s) => s.text.trim().length > 0);

    return {
      pageCount: undefined,
      sections: nonEmptySections,
    };
  }
}
