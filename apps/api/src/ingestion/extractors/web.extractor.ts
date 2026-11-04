import { Injectable } from '@nestjs/common';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import { DocumentFailureCode } from '@xs-rag/shared';
import { UrlGuard } from '../../documents/url-guard.js';
import { ExtractedDocument, ExtractedSection } from './pdf.extractor.js';

export class IngestionError extends Error {
  constructor(
    public readonly failureCode: DocumentFailureCode,
    message: string,
  ) {
    super(message);
    this.name = 'IngestionError';
  }
}

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const TIMEOUT_MS = 10000; // 10 s

@Injectable()
export class WebExtractor {
  async extract(initialUrl: string): Promise<ExtractedDocument> {
    let currentUrl = initialUrl;
    let redirectCount = 0;
    let htmlText = '';
    let responseTitle: string | undefined;

    while (true) {
      try {
        await UrlGuard.validateUrl(currentUrl);
      } catch (err: unknown) {
        throw new IngestionError(
          DocumentFailureCode.FETCH_FAILED,
          `URL validation failed during fetch: ${(err as Error).message}`,
        );
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

      let response: Response;
      try {
        response = await fetch(currentUrl, {
          signal: controller.signal,
          redirect: 'manual',
          headers: {
            'User-Agent': 'xs-rag-ingestion-bot/1.0',
            Accept: 'text/html,application/xhtml+xml',
          },
        });
      } catch (err: unknown) {
        clearTimeout(timeoutId);
        throw new IngestionError(
          DocumentFailureCode.FETCH_FAILED,
          `Failed to fetch web page: ${(err as Error).message}`,
        );
      } finally {
        clearTimeout(timeoutId);
      }

      // Handle redirects
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        redirectCount++;
        if (redirectCount > 3) {
          throw new IngestionError(
            DocumentFailureCode.FETCH_FAILED,
            'Web page fetch exceeded maximum of 3 redirects.',
          );
        }
        const location = response.headers.get('location');
        if (!location) {
          throw new IngestionError(
            DocumentFailureCode.FETCH_FAILED,
            'Redirect response missing Location header.',
          );
        }
        currentUrl = new URL(location, currentUrl).toString();
        continue;
      }

      if (!response.ok) {
        throw new IngestionError(
          DocumentFailureCode.FETCH_FAILED,
          `Web page returned HTTP ${response.status} ${response.statusText}.`,
        );
      }

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.toLowerCase().includes('text/html')) {
        throw new IngestionError(
          DocumentFailureCode.FETCH_FAILED,
          `Web page content type must be text/html, received: ${contentType}.`,
        );
      }

      const contentLengthStr = response.headers.get('content-length');
      if (contentLengthStr && parseInt(contentLengthStr, 10) > MAX_BYTES) {
        throw new IngestionError(
          DocumentFailureCode.FETCH_FAILED,
          'Web page size exceeds maximum limit of 5 MB.',
        );
      }

      // Stream body and enforce max size
      const body = response.body;
      if (!body) {
        throw new IngestionError(
          DocumentFailureCode.FETCH_FAILED,
          'Empty response body from web server.',
        );
      }

      const reader = body.getReader();
      const chunks: Uint8Array[] = [];
      let totalBytes = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          totalBytes += value.length;
          if (totalBytes > MAX_BYTES) {
            reader.cancel();
            throw new IngestionError(
              DocumentFailureCode.FETCH_FAILED,
              'Web page size exceeds maximum limit of 5 MB.',
            );
          }
          chunks.push(value);
        }
      }

      const combinedBuffer = Buffer.concat(chunks);
      htmlText = new TextDecoder('utf-8').decode(combinedBuffer);
      break;
    }

    if (!htmlText || htmlText.trim().length === 0) {
      throw new IngestionError(
        DocumentFailureCode.FETCH_FAILED,
        'Web page returned empty content.',
      );
    }

    const dom = new JSDOM(htmlText, { url: currentUrl });
    const doc = dom.window.document;
    responseTitle = doc.querySelector('title')?.textContent?.trim() || undefined;

    const reader = new Readability(doc);
    const article = reader.parse();

    if (!article || !article.content) {
      throw new IngestionError(
        DocumentFailureCode.FETCH_FAILED,
        'Could not extract readable article content from web page.',
      );
    }

    const title = responseTitle || article.title || undefined;
    const contentDom = new JSDOM(article.content);
    const body = contentDom.window.document.body;

    const sections: ExtractedSection[] = [];
    const headingStack: Array<{ level: number; text: string }> = [];
    let currentSection: ExtractedSection | null = null;

    const children = Array.from(body.children);
    for (const child of children) {
      const tagName = child.tagName.toUpperCase();
      if (/^H[1-4]$/.test(tagName)) {
        const level = parseInt(tagName.slice(1), 10);
        const headingText = child.textContent?.trim() || '';

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
      title,
      pageCount: undefined,
      sections: nonEmptySections,
    };
  }
}
