'use client';

import React from 'react';
import {
  CheckCircle2,
  Search,
  ShieldCheck,
  FileText,
  BarChart3,
  Code2,
  type LucideIcon,
} from 'lucide-react';
import { Reveal } from './reveal';
import { useReducedMotion } from './use-reduced-motion';

interface CapabilityItem {
  code: string;
  category: string;
  title: string;
  description: string;
  telemetryLeft: string;
  telemetryRight: string;
  Icon: LucideIcon;
  activePulse?: boolean;
}

const CAPABILITIES: CapabilityItem[] = [
  {
    code: 'CAP-01',
    category: 'SOURCE VERIFICATION',
    title: 'Verifiable Citations',
    description:
      "Every factual claim includes clickable citations linking directly to exact passages, pages, and sections. When answers aren't present in your workspace files, xs-RAG declines rather than fabricating.",
    telemetryLeft: '[1] -> PAGE · SECTION · PASSAGE',
    telemetryRight: 'GROUNDED',
    Icon: CheckCircle2,
    activePulse: true,
  },
  {
    code: 'CAP-02',
    category: 'RETRIEVAL ENGINE',
    title: 'Hybrid BM25 + Vector Search',
    description:
      'Reciprocal Rank Fusion combines pgvector dense embeddings with PostgreSQL full-text search to capture exact lexical matches and semantic similarities in a single query pass.',
    telemetryLeft: 'PGVECTOR(1536) + TSVECTOR',
    telemetryRight: 'RRF K=60',
    Icon: Search,
    activePulse: true,
  },
  {
    code: 'CAP-03',
    category: 'ACCESS CONTROL',
    title: 'Strict Permission Filtering',
    description:
      'Role-based visibility (Admins Only, All Members, Selected) is enforced inside SQL before ranking, preventing unauthorized content from ever entering the prompt context.',
    telemetryLeft: 'WHERE VIS_OK = TRUE',
    telemetryRight: 'SQL-GATED',
    Icon: ShieldCheck,
  },
  {
    code: 'CAP-04',
    category: 'INGESTION PIPELINE',
    title: 'Multi-Format Ingestion',
    description:
      'Extracts structured text and section hierarchies from PDF, DOCX, Markdown, and web URLs with automated SSRF protection, size limits, and chunk recovery workers.',
    telemetryLeft: 'PDF · DOCX · MD · URL',
    telemetryRight: 'SSRF SAFE',
    Icon: FileText,
  },
  {
    code: 'CAP-05',
    category: 'EVALUATION SUITE',
    title: 'Automated Evaluation',
    description:
      'Continuous LLM-as-a-judge benchmarking tracks accuracy, faithfulness, and retrieval scores across model updates with side-by-side run comparisons.',
    telemetryLeft: 'ACC · FAITH · RETRIEVAL',
    telemetryRight: 'BENCHMARKED',
    Icon: BarChart3,
  },
  {
    code: 'CAP-06',
    category: 'EDGE DEPLOYMENT',
    title: 'Embeddable Chat Widget',
    description:
      'Deploy a lightweight assistant on external websites via a single script tag, protected by strict Content-Security-Policy frame-ancestors origin controls.',
    telemetryLeft: 'CSP FRAME-ANCESTORS',
    telemetryRight: 'ORIGIN LOCKED',
    Icon: Code2,
    activePulse: true,
  },
];

/**
 * Technical enterprise capabilities matrix rendered with hairline dividers,
 * monospace system identifiers, and subtle hover illumination.
 */
export function CapabilitiesSection() {
  const reducedMotion = useReducedMotion();

  return (
    <section
      id="capabilities"
      className="relative border-t border-[#1E293B] bg-[#050812] py-20 sm:py-24 px-4 sm:px-6 lg:px-8"
    >
      {/* Subtle grid background */}
      <div className="pointer-events-none absolute inset-0 bg-infra-grid opacity-25 [mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_80%)]" />

      <div className="relative mx-auto max-w-7xl">
        <Reveal>
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between mb-12">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] text-[#06B6D4]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#2563EB]" />
                <span>CORE CAPABILITIES // INFRASTRUCTURE MATRIX</span>
              </div>
              <h2 className="mt-2 font-sans text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-[#F1F5F9]">
                Engineered for security, accuracy, and zero drift
              </h2>
            </div>

            <div className="flex items-center gap-3 font-mono text-[11px] text-[#94A3B8]">
              <span className="inline-flex items-center gap-1.5 rounded border border-[#1E293B] bg-[#090F1C] px-2.5 py-1">
                <span className="h-1.5 w-1.5 rounded-full bg-[#06B6D4]" />
                SINGLE POSTGRES + PGVECTOR
              </span>
              <span className="hidden sm:inline-flex items-center rounded border border-[#1E293B] bg-[#090F1C] px-2.5 py-1">
                06 MODULES
              </span>
            </div>
          </div>
        </Reveal>

        {/* Structured Border Grid */}
        <Reveal delayMs={100}>
          <div className="relative border border-[#1E293B] bg-[#1E293B] grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px">
            {CAPABILITIES.map((cap) => {
              const Icon = cap.Icon;
              return (
                <article
                  key={cap.code}
                  className="group relative flex flex-col justify-between bg-[#090F1C] p-6 sm:p-7 transition-colors duration-300 hover:bg-[#101827]"
                >
                  {/* Top fine accent trace on hover */}
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0 top-0 h-[2px] origin-left scale-x-0 bg-gradient-to-r from-[#2563EB] to-[#06B6D4] transition-transform duration-300 group-hover:scale-x-100"
                  />

                  <div>
                    {/* Metadata Header */}
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-9 w-9 items-center justify-center rounded border border-[#1E293B] bg-[#050812] text-[#3B82F6] transition-colors duration-300 group-hover:border-[#2563EB]/70 group-hover:text-[#06B6D4]">
                          <Icon className="h-4 w-4" strokeWidth={1.6} />
                        </div>
                        <div className="flex flex-col">
                          <span className="font-mono text-[10px] tracking-[0.14em] text-[#06B6D4]">
                            {cap.category}
                          </span>
                          <span className="font-mono text-[10px] text-[#94A3B8]">
                            {cap.code}
                          </span>
                        </div>
                      </div>

                      {/* Subtle status indicator */}
                      <div className="flex items-center gap-1.5 font-mono text-[10px] text-[#94A3B8]">
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            cap.activePulse
                              ? `bg-[#06B6D4] ${reducedMotion ? '' : 'animate-rag-pulse'}`
                              : 'bg-[#2563EB]'
                          }`}
                        />
                        <span className="hidden xl:inline">{cap.telemetryRight}</span>
                      </div>
                    </div>

                    {/* Title & Description */}
                    <h3 className="mt-5 font-sans text-lg font-semibold tracking-tight text-[#F1F5F9] transition-colors duration-200 group-hover:text-white">
                      {cap.title}
                    </h3>
                    <p className="mt-2.5 text-sm leading-relaxed text-[#94A3B8]">
                      {cap.description}
                    </p>
                  </div>

                  {/* Bottom Telemetry Footer */}
                  <div className="mt-6 pt-3.5 border-t border-[#1E293B]/80 flex items-center justify-between gap-2 font-mono text-[10px]">
                    <span className="truncate text-[#94A3B8] transition-colors duration-200 group-hover:text-[#F1F5F9]/85">
                      {cap.telemetryLeft}
                    </span>
                    <span className="shrink-0 text-[#2563EB] transition-colors duration-200 group-hover:text-[#06B6D4]">
                      READY
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
