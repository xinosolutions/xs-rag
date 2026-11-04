import { Injectable } from '@nestjs/common';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.js';

export interface ExtractedSection {
  page: number | null;
  heading: string | null;
  headingPath?: string | null;
  text: string;
}

export interface ExtractedDocument {
  title?: string;
  pageCount?: number;
  sections: ExtractedSection[];
}

interface TextLine {
  y: number;
  height: number;
  text: string;
}

@Injectable()
export class PdfExtractor {
  async extract(buffer: Buffer): Promise<ExtractedDocument> {
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(buffer),
      disableFontFace: true,
      isEvalSupported: false,
      useSystemFonts: true,
    });

    const doc = await loadingTask.promise;
    const pageCount = doc.numPages;
    const sections: ExtractedSection[] = [];
    let currentHeading: string | null = null;

    for (let p = 1; p <= pageCount; p++) {
      const page = await doc.getPage(p);
      const textContent = await page.getTextContent();
      const items = textContent.items as Array<{
        str: string;
        transform: number[];
        height?: number;
        width?: number;
      }>;

      // Group items into lines by vertical position
      const lineMap: { y: number; height: number; items: Array<{ x: number; str: string; height: number }> }[] = [];

      for (const item of items) {
        if (!item.str || item.str.trim().length === 0) continue;
        const x = item.transform[4] || 0;
        const y = item.transform[5] || 0;
        const height = item.height || Math.abs(item.transform[0]) || Math.abs(item.transform[3]) || 12;

        let existingLine = lineMap.find((l) => Math.abs(l.y - y) < 3);
        if (!existingLine) {
          existingLine = { y, height, items: [] };
          lineMap.push(existingLine);
        }
        existingLine.height = Math.max(existingLine.height, height);
        existingLine.items.push({ x, str: item.str, height });
      }

      // Sort lines top to bottom (descending y)
      lineMap.sort((a, b) => b.y - a.y);

      const lines: TextLine[] = lineMap
        .map((l) => {
          // Sort items left to right
          l.items.sort((a, b) => a.x - b.x);
          const lineText = l.items.map((i) => i.str).join(' ').replace(/\s+/g, ' ').trim();
          return {
            y: l.y,
            height: l.height,
            text: lineText,
          };
        })
        .filter((l) => l.text.length > 0);

      if (lines.length === 0) continue;

      // Calculate median font height for this page
      const heights = lines.map((l) => l.height).sort((a, b) => a - b);
      const mid = Math.floor(heights.length / 2);
      const median =
        heights.length % 2 === 0
          ? (heights[mid - 1]! + heights[mid]!) / 2
          : heights[mid]!;

      let currentSection: ExtractedSection | null = null;

      for (const line of lines) {
        const isHeading =
          line.height >= 1.15 * median &&
          line.text.length <= 100 &&
          !line.text.endsWith('.');

        if (isHeading) {
          currentHeading = line.text;
          currentSection = {
            page: p,
            heading: currentHeading,
            headingPath: currentHeading,
            text: '',
          };
          sections.push(currentSection);
        } else {
          if (!currentSection || currentSection.page !== p) {
            currentSection = {
              page: p,
              heading: currentHeading,
              headingPath: currentHeading,
              text: line.text,
            };
            sections.push(currentSection);
          } else {
            currentSection.text = currentSection.text
              ? `${currentSection.text}\n${line.text}`
              : line.text;
          }
        }
      }
    }

    // Filter out completely empty sections
    const nonEmptySections = sections.filter((s) => s.text.trim().length > 0);

    return {
      pageCount,
      sections: nonEmptySections,
    };
  }
}
