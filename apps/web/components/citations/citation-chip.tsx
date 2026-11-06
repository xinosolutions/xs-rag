'use client';

import React from 'react';
import { formatCitationLabel } from '@xs-rag/shared';
import { FileText } from 'lucide-react';

export interface CitationItem {
  id: string;
  index?: number;
  fileName: string;
  page?: number | null;
  heading?: string | null;
  snippet?: string | null;
  available?: boolean;
}

interface CitationChipProps {
  citation: CitationItem;
  onClick: () => void;
}

export function CitationChip({ citation, onClick }: CitationChipProps) {
  const label = formatCitationLabel({
    fileName: citation.fileName,
    page: citation.page,
    heading: citation.heading,
  });

  return (
    <button
      type="button"
      data-testid="citation-chip"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50/70 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 hover:border-blue-300 transition-colors dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-900/50"
      title={label}
    >
      <FileText className="h-3 w-3 shrink-0" />
      <span className="truncate max-w-[220px]">{label}</span>
    </button>
  );
}
