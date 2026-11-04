import { Injectable } from '@nestjs/common';
import { marked, Tokens } from 'marked';
import { ExtractedDocument, ExtractedSection } from './pdf.extractor.js';

@Injectable()
export class MarkdownExtractor {
  extract(rawText: string): ExtractedDocument {
    // Strip YAML front matter if present
    let cleanText = rawText;
    if (cleanText.startsWith('---')) {
      const match = cleanText.match(/^---[\s\S]*?\n---\s*\n?/);
      if (match) {
        cleanText = cleanText.slice(match[0].length);
      }
    }

    if (!cleanText || cleanText.trim().length === 0) {
      return {
        pageCount: undefined,
        sections: [],
      };
    }

    const tokens = marked.lexer(cleanText);
    const sections: ExtractedSection[] = [];
    const headingStack: Array<{ level: number; text: string }> = [];
    let currentSection: ExtractedSection | null = null;

    for (const token of tokens) {
      if (token.type === 'heading') {
        const headingToken = token as Tokens.Heading;
        const level = headingToken.depth;
        const headingText = headingToken.text.trim();

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
      } else if (token.type === 'space') {
        continue;
      } else {
        const textContent = ('text' in token && typeof token.text === 'string' ? token.text : token.raw).trim();
        if (textContent.length > 0) {
          if (!currentSection) {
            currentSection = {
              page: null,
              heading: null,
              headingPath: null,
              text: textContent,
            };
            sections.push(currentSection);
          } else {
            currentSection.text = currentSection.text
              ? `${currentSection.text}\n\n${textContent}`
              : textContent;
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
