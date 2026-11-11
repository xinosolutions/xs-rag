'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  UploadCloud,
  Layers,
  Cpu,
  SearchCheck,
  Quote,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react';
import { useReducedMotion } from './use-reduced-motion';

interface PipelineStage {
  id: string;
  step: string;
  name: string;
  summary: string;
  explanation: string;
  specs: string[];
  trace: string;
  Icon: LucideIcon;
}

const STAGES: PipelineStage[] = [
  {
    id: 'ingest',
    step: '01',
    name: 'INGEST',
    summary: 'Documents are uploaded and parsed.',
    explanation:
      'Extracts clean text, document structure, and section metadata from PDF, DOCX, Markdown, and SSRF-protected web URLs with transactional job recovery.',
    specs: ['PDF / DOCX / MD / URL', 'SSRF Guardrail', 'Recovery Workers'],
    trace: 'ingest.parse({ format: "pdf|docx|md|url", ssrfCheck: "pass" }) -> status: PARSED',
    Icon: UploadCloud,
  },
  {
    id: 'chunk',
    step: '02',
    name: 'CHUNK',
    summary: 'Content is divided into meaningful sections.',
    explanation:
      'Splits parsed content along heading hierarchies and page boundaries with controlled token overlap so every passage retains authoritative context.',
    specs: ['Heading Hierarchy', 'Page Attribution', 'Boundary Overlap'],
    trace: 'chunker.split({ preserveHeadings: true, pageNumbers: "tracked" }) -> 142_chunks',
    Icon: Layers,
  },
  {
    id: 'index',
    step: '03',
    name: 'INDEX',
    summary: 'Embeddings and full-text indexes are generated.',
    explanation:
      'Persists 1536-dimensional pgvector embeddings alongside PostgreSQL tsvector lexical indexes in one ACID-compliant database.',
    specs: ['pgvector(1536)', 'GIN tsvector', 'Single PostgreSQL'],
    trace: 'index.commit({ vectorDim: 1536, lexical: "websearch_tsvector" }) -> READY',
    Icon: Cpu,
  },
  {
    id: 'retrieve',
    step: '04',
    name: 'RETRIEVE',
    summary: 'Hybrid search finds relevant passages.',
    explanation:
      'Enforces role-based visibility inside SQL before ranking, then merges dense vector similarity and BM25 scores via Reciprocal Rank Fusion.',
    specs: ['SQL Pre-Filter', 'BM25 + Cosine', 'RRF 1/(60+rank)'],
    trace: 'SELECT * FROM chunks WHERE vis_allowed AND rrf_gate >= threshold LIMIT 6',
    Icon: SearchCheck,
  },
  {
    id: 'generate',
    step: '05',
    name: 'GENERATE',
    summary: 'Answers are generated with verifiable citations.',
    explanation:
      'Streams answers strictly grounded in retrieved passages with clickable [n] source links—or returns a locked fallback when evidence is missing.',
    specs: ['SSE Streaming', 'Inline [n] Citations', 'Strict Fallback'],
    trace: 'synthesize({ groundedOnly: true, citations: [1, 2], fabricated: 0 })',
    Icon: Quote,
  },
];

/**
 * Interactive 5-stage RAG pipeline section. Sequentially illuminates stages on viewport
 * entry and allows hovering or clicking any stage to inspect its execution mechanics.
 */
export function PipelineSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const reducedMotion = useReducedMotion();

  const [entered, setEntered] = useState(false);
  const [activatedCount, setActivatedCount] = useState(0);
  const [selectedIdx, setSelectedIdx] = useState<number>(0);

  useEffect(() => {
    if (reducedMotion) {
      setEntered(true);
      setActivatedCount(STAGES.length);
      return;
    }

    const el = sectionRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setEntered(true);
          observer.disconnect();
        }
      },
      { threshold: 0.08 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [reducedMotion]);

  useEffect(() => {
    if (!entered || reducedMotion) return;

    setActivatedCount(1);
    const timers: number[] = [];

    for (let i = 2; i <= STAGES.length; i++) {
      const id = window.setTimeout(() => {
        setActivatedCount(i);
        setSelectedIdx(i - 1);
      }, (i - 1) * 340);
      timers.push(id);
    }

    return () => {
      for (const id of timers) window.clearTimeout(id);
    };
  }, [entered, reducedMotion]);

  const activeStage = STAGES[selectedIdx] ?? STAGES[0];
  const progressPercent =
    activatedCount <= 1
      ? 0
      : ((Math.min(activatedCount, STAGES.length) - 1) / (STAGES.length - 1)) * 100;

  return (
    <section
      id="pipeline"
      ref={sectionRef}
      className="relative border-t border-[#1E293B] bg-[#090F1C] py-16 sm:py-20 px-4 sm:px-6 lg:px-8"
    >
      <div className="mx-auto max-w-7xl">
        {/* Section Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-10">
          <div>
            <div className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] text-[#06B6D4]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#06B6D4]" />
              <span>KNOWLEDGE INDEX // EXECUTION PIPELINE</span>
            </div>
            <h2 className="mt-2 font-sans text-2xl sm:text-3xl font-bold tracking-tight text-[#F1F5F9]">
              From documents to verifiable answers.
            </h2>
          </div>

          <p className="font-mono text-xs text-[#94A3B8]">
            Hover or select a stage to inspect pipeline telemetry
          </p>
        </div>

        {/* 5-Stage Horizontal Pipeline Track */}
        <div className="relative">
          {/* Desktop background & active connector rail */}
          <div
            aria-hidden="true"
            className="pointer-events-none hidden lg:block absolute top-[26px] left-[10%] right-[10%] h-px bg-[#1E293B]"
          >
            <div
              className="h-full bg-gradient-to-r from-[#2563EB] to-[#06B6D4] transition-[width] duration-500 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
            {STAGES.map((stage, idx) => {
              const isActivated = idx < activatedCount || reducedMotion;
              const isSelected = idx === selectedIdx;
              const Icon = stage.Icon;

              return (
                <button
                  key={stage.id}
                  type="button"
                  onMouseEnter={() => setSelectedIdx(idx)}
                  onFocus={() => setSelectedIdx(idx)}
                  onClick={() => setSelectedIdx(idx)}
                  aria-pressed={isSelected}
                  className={`group relative flex flex-col justify-between rounded-md border p-4 text-left transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] ${
                    isSelected
                      ? 'border-[#2563EB] bg-[#101827] shadow-[0_0_24px_-10px_rgba(37,99,235,0.6)]'
                      : isActivated
                        ? 'border-[#1E293B] bg-[#050812]/90 hover:border-[#2563EB]/60 hover:bg-[#101827]/70'
                        : 'border-[#1E293B]/60 bg-[#050812]/50 opacity-50'
                  }`}
                >
                  {/* Top indicator bar */}
                  <span
                    className={`absolute inset-x-0 top-0 h-[2px] transition-opacity duration-300 ${
                      isSelected
                        ? 'bg-gradient-to-r from-[#2563EB] to-[#06B6D4] opacity-100'
                        : 'bg-[#2563EB] opacity-0 group-hover:opacity-60'
                    }`}
                  />

                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <div
                        className={`flex h-8 w-8 items-center justify-center rounded border transition-colors duration-300 ${
                          isSelected
                            ? 'border-[#06B6D4]/70 bg-[#2563EB]/15 text-[#06B6D4]'
                            : isActivated
                              ? 'border-[#1E293B] bg-[#101827] text-[#3B82F6]'
                              : 'border-[#1E293B] bg-[#090F1C] text-[#94A3B8]'
                        }`}
                      >
                        <Icon className="h-4 w-4" strokeWidth={1.6} />
                      </div>

                      <span
                        className={`font-mono text-[10px] tracking-[0.14em] transition-colors duration-300 ${
                          isSelected ? 'text-[#06B6D4]' : 'text-[#94A3B8]'
                        }`}
                      >
                        STAGE {stage.step}
                      </span>
                    </div>

                    <h3 className="mt-3.5 font-mono text-xs font-semibold tracking-[0.12em] text-[#F1F5F9] flex items-center gap-1.5">
                      <span>{stage.name}</span>
                      <ChevronRight
                        className={`h-3 w-3 transition-all duration-200 ${
                          isSelected
                            ? 'translate-x-0.5 text-[#06B6D4] opacity-100'
                            : 'opacity-0 group-hover:opacity-70'
                        }`}
                      />
                    </h3>

                    <p className="mt-1.5 text-xs leading-relaxed text-[#94A3B8]">
                      {stage.summary}
                    </p>
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-[#1E293B]/80 flex items-center justify-between font-mono text-[10px]">
                    <span className={isActivated ? 'text-[#60A5FA]' : 'text-[#94A3B8]'}>
                      {isActivated ? 'ACTIVE' : 'QUEUED'}
                    </span>
                    <span
                      className={`h-1.5 w-1.5 rounded-full transition-colors duration-300 ${
                        isSelected
                          ? 'bg-[#06B6D4]'
                          : isActivated
                            ? 'bg-[#2563EB]'
                            : 'bg-[#1E293B]'
                      }`}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Stage Inspector Panel */}
        <div className="mt-4 rounded-md border border-[#1E293B] bg-[#050812] p-4 sm:p-5">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="space-y-1.5 max-w-3xl">
              <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
                <span className="rounded border border-[#2563EB]/50 bg-[#2563EB]/15 px-2 py-0.5 font-semibold text-[#60A5FA]">
                  {`${activeStage.step} // ${activeStage.name}`}
                </span>
                {activeStage.specs.map((spec) => (
                  <span
                    key={spec}
                    className="rounded border border-[#1E293B] bg-[#101827] px-2 py-0.5 text-[10px] text-[#94A3B8]"
                  >
                    {spec}
                  </span>
                ))}
              </div>
              <p className="text-sm leading-relaxed text-[#F1F5F9]/90">
                {activeStage.explanation}
              </p>
            </div>

            <div className="shrink-0 rounded border border-[#1E293B] bg-[#090F1C] px-3 py-2 font-mono text-[11px] text-[#06B6D4] overflow-x-auto max-w-full">
              <span className="text-[#94A3B8] select-none">$ </span>
              {activeStage.trace}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
