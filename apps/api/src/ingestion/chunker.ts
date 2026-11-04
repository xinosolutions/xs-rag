import { randomUUID } from 'node:crypto';
import { ExtractedSection } from './extractors/pdf.extractor.js';

export interface ChunkItem {
  id: string;
  ordinal: number;
  text: string;
  page: number | null;
  heading: string | null;
  headingPath: string | null;
  tokenCount: number;
  embeddingInput: string;
}

const TARGET_CHARS = 1000;
const MAX_CHARS = 1400;
const MAX_OVERLAP = 150;
const MIN_FRAGMENT = 40;

export class Chunker {
  static chunkSections(documentTitle: string, sections: ExtractedSection[]): ChunkItem[] {
    const chunks: ChunkItem[] = [];
    let ordinal = 0;

    for (const section of sections) {
      if (!section.text || section.text.trim().length === 0) continue;

      const sectionChunks = this.chunkSingleSection(section.text);

      for (const text of sectionChunks) {
        const headerInfo = section.headingPath || section.heading;
        const embeddingInput = headerInfo
          ? `${documentTitle} > ${headerInfo}\n${text}`
          : `${documentTitle}\n${text}`;

        chunks.push({
          id: randomUUID(),
          ordinal: ordinal++,
          text,
          page: section.page ?? null,
          heading: section.heading ?? null,
          headingPath: section.headingPath ?? null,
          tokenCount: Math.ceil(text.length / 4),
          embeddingInput,
        });
      }
    }

    return chunks;
  }

  private static chunkSingleSection(sectionText: string): string[] {
    const trimmed = sectionText.trim();
    if (trimmed.length === 0) {
      return [];
    }

    // Split section into paragraphs
    const rawParagraphs = trimmed
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    // Split any paragraph > MAX_CHARS by sentence ends
    const atomicSegments: string[] = [];
    for (const para of rawParagraphs) {
      if (para.length <= MAX_CHARS) {
        atomicSegments.push(para);
      } else {
        const sentences = para.split(/(?<=[.!?])\s+/).filter((s) => s.length > 0);
        for (const sent of sentences) {
          if (sent.length <= MAX_CHARS) {
            atomicSegments.push(sent);
          } else {
            const words = sent.split(/\s+/);
            let cur = '';
            for (const w of words) {
              if ((cur + ' ' + w).length > MAX_CHARS) {
                if (cur) atomicSegments.push(cur.trim());
                cur = w;
              } else {
                cur = cur ? `${cur} ${w}` : w;
              }
            }
            if (cur) atomicSegments.push(cur.trim());
          }
        }
      }
    }

    if (atomicSegments.length === 0) {
      return [];
    }

    // If total text across all segments is small and fits in one chunk, return it
    if (atomicSegments.length === 1 && atomicSegments[0]!.length <= MAX_CHARS) {
      return [atomicSegments[0]!];
    }

    const chunkTexts: string[] = [];
    let segIndex = 0;

    while (segIndex < atomicSegments.length) {
      let currentText = '';

      // Add overlap from previous chunk if within the same section
      if (chunkTexts.length > 0) {
        const prev = chunkTexts[chunkTexts.length - 1]!;
        const slice = prev.slice(-MAX_OVERLAP);
        const firstSpace = slice.indexOf(' ');
        let overlap = firstSpace !== -1 ? slice.slice(firstSpace + 1).trim() : slice.trim();
        if (overlap.length > MAX_OVERLAP) {
          overlap = overlap.slice(-MAX_OVERLAP).trim();
        }
        currentText = overlap;
      }

      const initialLen = currentText.length;
      let addedAny = false;

      while (segIndex < atomicSegments.length) {
        const nextSeg = atomicSegments[segIndex]!;
        const candidate = currentText ? `${currentText}\n\n${nextSeg}` : nextSeg;

        if (candidate.length <= TARGET_CHARS) {
          currentText = candidate;
          segIndex++;
          addedAny = true;
        } else if (candidate.length <= MAX_CHARS && !addedAny) {
          currentText = candidate;
          segIndex++;
          addedAny = true;
          break;
        } else if (candidate.length <= MAX_CHARS && currentText.length < TARGET_CHARS) {
          currentText = candidate;
          segIndex++;
          addedAny = true;
          break;
        } else {
          break;
        }
      }

      if (!addedAny && segIndex < atomicSegments.length) {
        currentText = atomicSegments[segIndex]!;
        segIndex++;
      }

      // Check if this is the final segment and whether remaining fragment is under MIN_FRAGMENT
      const newCharsAdded = currentText.length - initialLen;
      if (chunkTexts.length > 0 && newCharsAdded < MIN_FRAGMENT && segIndex >= atomicSegments.length) {
        const prev = chunkTexts[chunkTexts.length - 1]!;
        const lastSeg = atomicSegments[segIndex - 1]!;
        const merged = `${prev}\n\n${lastSeg}`;
        if (merged.length <= MAX_CHARS) {
          chunkTexts[chunkTexts.length - 1] = merged;
        }
        break;
      }

      if (currentText.trim().length > 0) {
        chunkTexts.push(currentText.trim());
      }
    }

    return chunkTexts;
  }
}
