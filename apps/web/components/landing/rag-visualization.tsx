'use client';

import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import {
  FileText,
  FileCode2,
  Globe,
  FileSpreadsheet,
  Lock,
  ShieldCheck,
  Database,
  CheckCircle2,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import { useReducedMotion } from './use-reduced-motion';

type DocFormat = 'PDF' | 'DOCX' | 'MD' | 'WEB';

interface DocumentNodeSpec {
  id: string;
  title: string;
  format: DocFormat;
  chunks: number;
  visibility: 'ALL_MEMBERS' | 'ADMINS_ONLY';
}

interface CitationSpec {
  index: 1 | 2;
  docId: string;
  source: string;
  section: string;
  location: string;
  score: string;
  excerpt: string;
}

interface ScenarioSpec {
  id: string;
  label: string;
  query: string;
  role: 'MEMBER' | 'ADMIN';
  activeDocs: string[];
  gatedDocs: string[];
  chunks: { id: string; tag: string; metric: string }[];
  rrfTop: { label: string; vecScore: string; bm25Score: string; rrf: string }[];
  answerParts: {
    prefix: string;
    middle: string;
    suffix: string;
  };
  citations: [CitationSpec, CitationSpec];
  latency: string;
}

const DOCUMENTS: DocumentNodeSpec[] = [
  {
    id: 'doc-pdf',
    title: 'employee-handbook.pdf',
    format: 'PDF',
    chunks: 142,
    visibility: 'ALL_MEMBERS',
  },
  {
    id: 'doc-docx',
    title: 'it-security-policy.docx',
    format: 'DOCX',
    chunks: 88,
    visibility: 'ADMINS_ONLY',
  },
  {
    id: 'doc-md',
    title: 'remote-work-policy.md',
    format: 'MD',
    chunks: 36,
    visibility: 'ALL_MEMBERS',
  },
  {
    id: 'doc-web',
    title: 'docs.acme.internal/faq',
    format: 'WEB',
    chunks: 64,
    visibility: 'ALL_MEMBERS',
  },
];

const SCENARIOS: ScenarioSpec[] = [
  {
    id: 'remote-policy',
    label: 'Remote Work Policy',
    query: 'Can engineers work remotely from another country?',
    role: 'MEMBER',
    activeDocs: ['doc-pdf', 'doc-md'],
    gatedDocs: ['doc-docx'],
    chunks: [
      { id: 'ch_014', tag: '§3.2', metric: '1536d' },
      { id: 'ch_008', tag: 'p.12', metric: 'tsvec' },
      { id: 'ch_029', tag: '§1.4', metric: 'index' },
    ],
    rrfTop: [
      { label: 'remote-work-policy.md', vecScore: '0.94', bm25Score: '0.88', rrf: '0.0325' },
      { label: 'employee-handbook.pdf', vecScore: '0.89', bm25Score: '0.84', rrf: '0.0314' },
    ],
    answerParts: {
      prefix: 'Full-time employees may work internationally up to 30 calendar days per year ',
      middle: ' with manager sign-off and regional tax verification ',
      suffix: '.',
    },
    citations: [
      {
        index: 1,
        docId: 'doc-md',
        source: 'remote-work-policy.md',
        section: '§ 3.2 International Remote',
        location: 'Lines 44–51',
        score: '0.94',
        excerpt:
          'Full-time team members in good standing may work from approved international regions for up to 30 calendar days annually.',
      },
      {
        index: 2,
        docId: 'doc-pdf',
        source: 'employee-handbook.pdf',
        section: '§ 5.1 Cross-Border Compliance',
        location: 'Page 12',
        score: '0.89',
        excerpt:
          'Cross-border work requests require written manager approval and regional payroll tax clearance prior to departure.',
      },
    ],
    latency: '1.1s TTFT',
  },
  {
    id: 'widget-csp',
    label: 'Widget Origin Security',
    query: 'How are embeddable widget keys origin-restricted?',
    role: 'ADMIN',
    activeDocs: ['doc-docx', 'doc-web'],
    gatedDocs: [],
    chunks: [
      { id: 'ch_042', tag: '§4.1', metric: '1536d' },
      { id: 'ch_019', tag: '/url', metric: 'tsvec' },
      { id: 'ch_051', tag: 'csp', metric: 'index' },
    ],
    rrfTop: [
      { label: 'it-security-policy.docx', vecScore: '0.96', bm25Score: '0.92', rrf: '0.0328' },
      { label: 'docs.acme.internal/faq', vecScore: '0.91', bm25Score: '0.86', rrf: '0.0317' },
    ],
    answerParts: {
      prefix: 'Embeddable widget endpoints emit strict Content-Security-Policy frame-ancestors headers ',
      middle: ' validated against workspace allowedOrigins before mounting the iframe ',
      suffix: '.',
    },
    citations: [
      {
        index: 1,
        docId: 'doc-docx',
        source: 'it-security-policy.docx',
        section: '§ 4.1 Origin Controls',
        location: 'Section 4.1',
        score: '0.96',
        excerpt:
          'Every /embed/:key response enforces a Content-Security-Policy frame-ancestors directive scoped strictly to configured origins.',
      },
      {
        index: 2,
        docId: 'doc-web',
        source: 'docs.acme.internal/faq',
        section: 'Embed Runtime Spec',
        location: 'URL /embed',
        score: '0.91',
        excerpt:
          'Widget keys without verified allowedOrigins reject external iframe embedding and default to frame-ancestors none.',
      },
    ],
    latency: '0.9s TTFT',
  },
  {
    id: 'expense-rules',
    label: 'Expense Verification',
    query: 'What documentation is required for travel expenses?',
    role: 'MEMBER',
    activeDocs: ['doc-pdf', 'doc-web'],
    gatedDocs: ['doc-docx'],
    chunks: [
      { id: 'ch_027', tag: 'p.18', metric: '1536d' },
      { id: 'ch_033', tag: '/fin', metric: 'tsvec' },
      { id: 'ch_009', tag: '§7.2', metric: 'index' },
    ],
    rrfTop: [
      { label: 'employee-handbook.pdf', vecScore: '0.93', bm25Score: '0.90', rrf: '0.0324' },
      { label: 'docs.acme.internal/faq', vecScore: '0.87', bm25Score: '0.83', rrf: '0.0310' },
    ],
    answerParts: {
      prefix: 'Itemized merchant receipts are mandatory for transactions exceeding $25 ',
      middle: ', and flights require corporate portal approval 14 days in advance ',
      suffix: '.',
    },
    citations: [
      {
        index: 1,
        docId: 'doc-pdf',
        source: 'employee-handbook.pdf',
        section: '§ 7.2 Travel & Expense',
        location: 'Page 18',
        score: '0.93',
        excerpt:
          'All single transactions over $25 USD must attach an itemized merchant receipt displaying date, tax, and line items.',
      },
      {
        index: 2,
        docId: 'doc-web',
        source: 'docs.acme.internal/faq',
        section: 'Finance & Procurement',
        location: 'URL /finance',
        score: '0.87',
        excerpt:
          'Airfare and hotel bookings must be submitted through the approved travel tier at least 14 calendar days prior to departure.',
      },
    ],
    latency: '1.0s TTFT',
  },
];

interface AnchorGeometry {
  width: number;
  height: number;
  docPorts: Record<string, { rightX: number; rightY: number; topX: number; topY: number }>;
  indexLeft: { x: number; y: number };
  indexBottom: { x: number; y: number };
  retrieveTop: { x: number; y: number };
  retrieveRight: { x: number; y: number };
  answerLeft: { x: number; y: number };
  answerTop: { x: number; y: number };
}

function FormatIcon({ format, active }: { format: DocFormat; active: boolean }) {
  const cls = `h-3.5 w-3.5 shrink-0 transition-colors duration-300 ${
    active ? 'text-[#06B6D4]' : 'text-[#94A3B8]'
  }`;

  switch (format) {
    case 'PDF':
      return <FileText className={cls} strokeWidth={1.75} />;
    case 'DOCX':
      return <FileSpreadsheet className={cls} strokeWidth={1.75} />;
    case 'MD':
      return <FileCode2 className={cls} strokeWidth={1.75} />;
    case 'WEB':
      return <Globe className={cls} strokeWidth={1.75} />;
  }
}

/**
 * Interactive enterprise RAG infrastructure visualization showing source ingestion,
 * vector + lexical indexing, SQL-filtered hybrid RRF retrieval, and verifiable return citations.
 */
export function RagVisualization() {
  const uid = useId().replace(/:/g, '');
  const reducedMotion = useReducedMotion();

  const [scenarioIdx, setScenarioIdx] = useState(0);
  const [selectedCitationIdx, setSelectedCitationIdx] = useState<1 | 2>(1);
  const [hoveredDocId, setHoveredDocId] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);

  const canvasRef = useRef<HTMLDivElement>(null);
  const docRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const indexRef = useRef<HTMLDivElement>(null);
  const retrieveRef = useRef<HTMLDivElement>(null);
  const answerRef = useRef<HTMLDivElement>(null);

  const [geometry, setGeometry] = useState<AnchorGeometry | null>(null);

  const scenario = SCENARIOS[scenarioIdx] ?? SCENARIOS[0];
  const activeCitation =
    scenario.citations.find((c) => c.index === selectedCitationIdx) ?? scenario.citations[0];

  // Auto-cycle query scenarios gently when idle and motion is permitted
  useEffect(() => {
    if (reducedMotion || isPaused) return;
    const timer = window.setInterval(() => {
      setScenarioIdx((prev) => (prev + 1) % SCENARIOS.length);
      setSelectedCitationIdx(1);
    }, 6800);
    return () => window.clearInterval(timer);
  }, [reducedMotion, isPaused]);

  // Measure DOM node ports so SVG bezier paths & particles stay locked at every viewport
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const measure = () => {
      const rootRect = canvas.getBoundingClientRect();
      if (rootRect.width === 0 || rootRect.height === 0) return;

      const docPorts: Record<string, { rightX: number; rightY: number; topX: number; topY: number }> =
        {};

      for (const doc of DOCUMENTS) {
        const el = docRefs.current[doc.id];
        if (!el) continue;
        const r = el.getBoundingClientRect();
        docPorts[doc.id] = {
          rightX: r.right - rootRect.left,
          rightY: r.top + r.height / 2 - rootRect.top,
          topX: r.left + r.width * 0.72 - rootRect.left,
          topY: r.top - rootRect.top,
        };
      }

      const idxRect = indexRef.current?.getBoundingClientRect();
      const retRect = retrieveRef.current?.getBoundingClientRect();
      const ansRect = answerRef.current?.getBoundingClientRect();

      if (!idxRect || !retRect || !ansRect) return;

      setGeometry({
        width: rootRect.width,
        height: rootRect.height,
        docPorts,
        indexLeft: {
          x: idxRect.left - rootRect.left,
          y: idxRect.top + idxRect.height / 2 - rootRect.top,
        },
        indexBottom: {
          x: idxRect.left + idxRect.width / 2 - rootRect.left,
          y: idxRect.bottom - rootRect.top,
        },
        retrieveTop: {
          x: retRect.left + retRect.width / 2 - rootRect.left,
          y: retRect.top - rootRect.top,
        },
        retrieveRight: {
          x: retRect.right - rootRect.left,
          y: retRect.top + retRect.height / 2 - rootRect.top,
        },
        answerLeft: {
          x: ansRect.left - rootRect.left,
          y: ansRect.top + ansRect.height * 0.52 - rootRect.top,
        },
        answerTop: {
          x: ansRect.left + ansRect.width * 0.35 - rootRect.left,
          y: ansRect.top - rootRect.top,
        },
      });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [scenarioIdx]);

  const handleSelectScenario = (index: number) => {
    setIsPaused(true);
    setScenarioIdx(index);
    setSelectedCitationIdx(1);
    setHoveredDocId(null);
  };

  const handleSelectDoc = (docId: string) => {
    setIsPaused(true);
    const matchingCit = scenario.citations.find((c) => c.docId === docId);
    if (matchingCit) {
      setSelectedCitationIdx(matchingCit.index);
    }
  };

  const focusedDocId = hoveredDocId ?? activeCitation.docId;

  return (
    <div
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      className="relative overflow-hidden rounded-lg border border-[#1E293B] bg-[#090F1C]/95 shadow-[0_24px_80px_-24px_rgba(2,6,23,0.95)]"
    >
      {/* Subtle architectural background grid */}
      <div className="pointer-events-none absolute inset-0 bg-infra-grid opacity-35" />
      <div
        className="pointer-events-none absolute -top-24 left-1/2 h-56 w-96 -translate-x-1/2 rounded-full blur-3xl"
        style={{ background: 'radial-gradient(circle, rgba(37,99,235,0.16), transparent 70%)' }}
      />

      {/* Top Telemetry Bar */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-2 border-b border-[#1E293B] bg-[#050812]/80 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full bg-[#06B6D4] ${
              reducedMotion ? '' : 'animate-rag-pulse'
            }`}
          />
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#F1F5F9]">
            RETRIEVAL TOPOLOGY // LIVE TRACE
          </span>
        </div>

        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider">
          <span className="inline-flex items-center gap-1 rounded border border-[#1E293B] bg-[#101827] px-2 py-0.5 text-[#94A3B8]">
            <ShieldCheck className="h-3 w-3 text-[#06B6D4]" />
            SQL {scenario.role}
          </span>
          <span className="hidden sm:inline-flex items-center rounded border border-[#2563EB]/40 bg-[#2563EB]/10 px-2 py-0.5 text-[#60A5FA]">
            PGVECTOR + BM25
          </span>
        </div>
      </div>

      {/* Interactive Query Switcher */}
      <div className="relative z-10 border-b border-[#1E293B]/80 bg-[#050812]/40 px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#94A3B8] mr-1">
            QUERY:
          </span>
          {SCENARIOS.map((item, idx) => {
            const active = idx === scenarioIdx;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelectScenario(idx)}
                className={`rounded border px-2.5 py-1 font-mono text-[11px] transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] ${
                  active
                    ? 'border-[#2563EB] bg-[#2563EB]/15 text-[#F1F5F9] shadow-[0_0_14px_-4px_rgba(37,99,235,0.65)]'
                    : 'border-[#1E293B] bg-[#101827]/70 text-[#94A3B8] hover:border-[#2563EB]/50 hover:text-[#F1F5F9]'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
        <p className="mt-2 font-mono text-xs text-[#F1F5F9] truncate">
          <span className="text-[#06B6D4] mr-1.5">&gt;</span>
          &ldquo;{scenario.query}&rdquo;
        </p>
      </div>

      {/* Desktop Interactive Node Graph & SVG Data Flow */}
      <div className="relative z-10 px-4 pt-6 pb-3">
        <div
          ref={canvasRef}
          className="relative hidden md:grid md:grid-cols-[175px_1fr_218px] lg:grid-cols-[185px_1fr_235px] items-center gap-6 pt-5 pb-2"
        >
          {/* SVG Overlay for Bezier Connections, Data Particles & Citation Return Arcs */}
          {geometry && (
            <svg
              aria-hidden="true"
              width={geometry.width}
              height={geometry.height}
              viewBox={`0 0 ${geometry.width} ${geometry.height}`}
              className="pointer-events-none absolute inset-0 overflow-visible"
            >
              <defs>
                <filter id={`${uid}-glow`} x="-40%" y="-40%" width="180%" height="180%">
                  <feGaussianBlur stdDeviation="2.5" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {/* 1. Document Nodes -> Indexing Layer */}
              {DOCUMENTS.map((doc, idx) => {
                const port = geometry.docPorts[doc.id];
                if (!port) return null;

                const isActive = scenario.activeDocs.includes(doc.id);
                const isGated = scenario.gatedDocs.includes(doc.id);
                const isFocused = focusedDocId === doc.id;

                const targetY = geometry.indexLeft.y + (idx - 1.5) * 9;
                const midX = (port.rightX + geometry.indexLeft.x) / 2;
                const pathD = `M ${port.rightX} ${port.rightY} C ${midX} ${port.rightY}, ${midX} ${targetY}, ${geometry.indexLeft.x} ${targetY}`;
                const pathId = `${uid}-doc-${doc.id}`;

                return (
                  <g key={doc.id}>
                    <path
                      id={pathId}
                      d={pathD}
                      fill="none"
                      stroke={
                        isGated
                          ? 'rgba(30, 41, 59, 0.5)'
                          : isFocused
                            ? '#06B6D4'
                            : isActive
                              ? '#2563EB'
                              : 'rgba(30, 41, 59, 0.7)'
                      }
                      strokeWidth={isFocused ? 1.75 : isActive ? 1.35 : 1}
                      strokeDasharray={isActive ? '4 4' : isGated ? '2 4' : undefined}
                      className={isActive && !reducedMotion ? 'animate-rag-dash' : undefined}
                      opacity={isGated ? 0.45 : isActive ? 0.95 : 0.4}
                    />
                    {isActive && !reducedMotion && (
                      <circle
                        r={isFocused ? 3.2 : 2.5}
                        fill={isFocused ? '#06B6D4' : '#3B82F6'}
                        filter={`url(#${uid}-glow)`}
                      >
                        <animateMotion
                          dur={`${2.1 + idx * 0.25}s`}
                          repeatCount="indefinite"
                          path={pathD}
                        />
                      </circle>
                    )}
                  </g>
                );
              })}

              {/* 2. Indexing Layer -> Hybrid Retrieval Engine (Dual Semantic + Lexical Bus) */}
              {(() => {
                const x1 = geometry.indexBottom.x - 12;
                const x2 = geometry.indexBottom.x + 12;
                const y1 = geometry.indexBottom.y;
                const y2 = geometry.retrieveTop.y;
                const leftBus = `M ${x1} ${y1} L ${x1} ${y2}`;
                const rightBus = `M ${x2} ${y1} L ${x2} ${y2}`;

                return (
                  <g>
                    <path
                      d={leftBus}
                      fill="none"
                      stroke="#2563EB"
                      strokeWidth="1.4"
                      strokeDasharray="3 3"
                      className={reducedMotion ? undefined : 'animate-rag-dash'}
                    />
                    <path
                      d={rightBus}
                      fill="none"
                      stroke="#06B6D4"
                      strokeWidth="1.4"
                      strokeDasharray="3 3"
                      className={reducedMotion ? undefined : 'animate-rag-dash'}
                    />
                    {!reducedMotion && (
                      <>
                        <circle r="2.6" fill="#3B82F6" filter={`url(#${uid}-glow)`}>
                          <animateMotion dur="1.4s" repeatCount="indefinite" path={leftBus} />
                        </circle>
                        <circle r="2.6" fill="#06B6D4" filter={`url(#${uid}-glow)`}>
                          <animateMotion
                            dur="1.4s"
                            begin="0.65s"
                            repeatCount="indefinite"
                            path={rightBus}
                          />
                        </circle>
                      </>
                    )}
                  </g>
                );
              })()}

              {/* 3. Hybrid Retrieval Engine -> Grounded AI Response */}
              {(() => {
                const start = geometry.retrieveRight;
                const end = geometry.answerLeft;
                const midX = (start.x + end.x) / 2;
                const pathD = `M ${start.x} ${start.y} C ${midX} ${start.y}, ${midX} ${end.y}, ${end.x} ${end.y}`;

                return (
                  <g>
                    <path
                      d={pathD}
                      fill="none"
                      stroke="#2563EB"
                      strokeWidth="1.65"
                      strokeDasharray="5 4"
                      className={reducedMotion ? undefined : 'animate-rag-dash'}
                    />
                    {!reducedMotion && (
                      <>
                        <circle r="3.2" fill="#06B6D4" filter={`url(#${uid}-glow)`}>
                          <animateMotion dur="1.8s" repeatCount="indefinite" path={pathD} />
                        </circle>
                        <circle r="2.4" fill="#2563EB" filter={`url(#${uid}-glow)`}>
                          <animateMotion
                            dur="1.8s"
                            begin="0.9s"
                            repeatCount="indefinite"
                            path={pathD}
                          />
                        </circle>
                      </>
                    )}
                  </g>
                );
              })()}

              {/* 4. Citation Return Arcs: Grounded Response -> Original Source Documents */}
              {scenario.citations.map((cit) => {
                const docPort = geometry.docPorts[cit.docId];
                if (!docPort) return null;

                const isSelected = cit.index === activeCitation.index;
                const startX = geometry.answerTop.x + (cit.index === 1 ? -14 : 14);
                const startY = geometry.answerTop.y;
                const endX = docPort.topX;
                const endY = docPort.topY;
                const arcApexY = Math.max(4, Math.min(startY, endY) - (cit.index === 1 ? 26 : 16));
                const pathD = `M ${startX} ${startY} C ${startX} ${arcApexY}, ${endX} ${arcApexY}, ${endX} ${endY}`;

                return (
                  <g key={cit.index}>
                    <path
                      d={pathD}
                      fill="none"
                      stroke={isSelected ? '#06B6D4' : 'rgba(6, 182, 212, 0.28)'}
                      strokeWidth={isSelected ? 1.6 : 1}
                      strokeDasharray="3 4"
                    />
                    {isSelected && !reducedMotion && (
                      <circle r="2.8" fill="#06B6D4" filter={`url(#${uid}-glow)`}>
                        <animateMotion dur="2.2s" repeatCount="indefinite" path={pathD} />
                      </circle>
                    )}
                    <circle
                      cx={endX}
                      cy={endY}
                      r={isSelected ? 3 : 2}
                      fill={isSelected ? '#06B6D4' : '#1E293B'}
                    />
                  </g>
                );
              })}
            </svg>
          )}

          {/* Column 1: Document Source Nodes */}
          <div className="relative z-10 space-y-2">
            <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#94A3B8]">
              01 // SOURCE NODES
            </div>
            {DOCUMENTS.map((doc) => {
              const isActive = scenario.activeDocs.includes(doc.id);
              const isGated = scenario.gatedDocs.includes(doc.id);
              const isFocused = focusedDocId === doc.id;

              return (
                <button
                  key={doc.id}
                  ref={(el) => {
                    docRefs.current[doc.id] = el;
                  }}
                  type="button"
                  onMouseEnter={() => setHoveredDocId(doc.id)}
                  onMouseLeave={() => setHoveredDocId(null)}
                  onClick={() => handleSelectDoc(doc.id)}
                  className={`group relative w-full rounded border px-2.5 py-2 text-left transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] ${
                    isFocused
                      ? 'border-[#06B6D4] bg-[#101827] shadow-[0_0_20px_-6px_rgba(6,182,212,0.65)]'
                      : isActive
                        ? 'border-[#2563EB]/75 bg-[#101827]/95 shadow-[0_0_16px_-8px_rgba(37,99,235,0.55)]'
                        : 'border-[#1E293B] bg-[#050812]/80 opacity-60 hover:opacity-90'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <FormatIcon format={doc.format} active={isActive || isFocused} />
                      <span className="truncate font-mono text-[10px] font-medium text-[#F1F5F9]">
                        {doc.title}
                      </span>
                    </div>
                    {isGated ? (
                      <Lock className="h-3 w-3 shrink-0 text-[#94A3B8]" />
                    ) : (
                      <span
                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                          isFocused
                            ? 'bg-[#06B6D4]'
                            : isActive
                              ? 'bg-[#2563EB]'
                              : 'bg-[#1E293B]'
                        }`}
                      />
                    )}
                  </div>
                  <div className="mt-1 flex items-center justify-between font-mono text-[9px] text-[#94A3B8]">
                    <span>
                      {doc.format} · {doc.chunks}ch
                    </span>
                    <span className={isGated ? 'text-[#94A3B8]' : isActive ? 'text-[#06B6D4]' : ''}>
                      {isGated ? 'SQL-GATED' : doc.visibility === 'ADMINS_ONLY' ? 'ADMIN' : 'ALL'}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Column 2: Indexing Layer + Semantic Retrieval Engine */}
          <div className="relative z-10 flex flex-col gap-5">
            {/* Indexing & Chunking Layer */}
            <div
              ref={indexRef}
              className="relative overflow-hidden rounded border border-[#1E293B] bg-[#101827]/95 p-3"
            >
              {/* Subtle vertical scanning beam */}
              {!reducedMotion && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-transparent via-[#06B6D4]/15 to-transparent animate-rag-scan"
                />
              )}

              <div className="flex items-center justify-between border-b border-[#1E293B]/80 pb-1.5">
                <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#06B6D4]">
                  02A // INDEXING LAYER
                </span>
                <Database className="h-3 w-3 text-[#2563EB]" />
              </div>

              <div className="mt-2 grid grid-cols-3 gap-1.5">
                {scenario.chunks.map((chunk) => (
                  <div
                    key={chunk.id}
                    className="min-w-0 rounded border border-[#1E293B] bg-[#050812]/90 px-1.5 py-1.5"
                  >
                    <div className="truncate font-mono text-[9px] font-medium text-[#F1F5F9]">
                      {chunk.id}
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-1 font-mono text-[8px]">
                      <span className="text-[#94A3B8]">{chunk.tag}</span>
                      <span className="text-[#06B6D4]">{chunk.metric}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Semantic & BM25 Retrieval Engine */}
            <div
              ref={retrieveRef}
              className="relative rounded border border-[#2563EB]/60 bg-[#101827] p-3 shadow-[0_0_24px_-10px_rgba(37,99,235,0.45)]"
            >
              <div className="flex items-center justify-between border-b border-[#1E293B] pb-1.5">
                <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#F1F5F9]">
                  02B // HYBRID RRF ENGINE
                </span>
                <span className="rounded bg-[#2563EB]/20 px-1.5 py-0.5 font-mono text-[8px] text-[#60A5FA]">
                  1/(60+r)
                </span>
              </div>

              <div className="mt-2 space-y-1.5">
                {scenario.rrfTop.map((item, idx) => (
                  <div
                    key={item.label}
                    className="flex items-center justify-between rounded border border-[#1E293B]/90 bg-[#050812]/80 px-2 py-1 font-mono text-[9px]"
                  >
                    <span className="truncate text-[#F1F5F9] pr-2">
                      #{idx + 1} {item.label}
                    </span>
                    <span className="shrink-0 text-[#06B6D4]">RRF {item.rrf}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Column 3: Grounded AI Response + Citation Triggers */}
          <div
            ref={answerRef}
            className="relative z-10 rounded border border-[#1E293B] bg-[#101827] p-3"
          >
            <div className="flex items-center justify-between border-b border-[#1E293B] pb-1.5">
              <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#06B6D4]">
                03 // GROUNDED ANSWER
              </span>
              <CheckCircle2 className="h-3.5 w-3.5 text-[#06B6D4]" />
            </div>

            <p className="mt-2.5 text-xs leading-relaxed text-[#F1F5F9]">
              {scenario.answerParts.prefix}
              <button
                type="button"
                onClick={() => {
                  setIsPaused(true);
                  setSelectedCitationIdx(1);
                }}
                onMouseEnter={() => setSelectedCitationIdx(1)}
                className={`mx-0.5 inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#06B6D4] ${
                  selectedCitationIdx === 1
                    ? 'bg-[#06B6D4] text-[#050812]'
                    : 'border border-[#2563EB]/60 bg-[#2563EB]/20 text-[#60A5FA] hover:bg-[#06B6D4]/20 hover:text-[#06B6D4]'
                }`}
              >
                [1]
              </button>
              {scenario.answerParts.middle}
              <button
                type="button"
                onClick={() => {
                  setIsPaused(true);
                  setSelectedCitationIdx(2);
                }}
                onMouseEnter={() => setSelectedCitationIdx(2)}
                className={`mx-0.5 inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#06B6D4] ${
                  selectedCitationIdx === 2
                    ? 'bg-[#06B6D4] text-[#050812]'
                    : 'border border-[#2563EB]/60 bg-[#2563EB]/20 text-[#60A5FA] hover:bg-[#06B6D4]/20 hover:text-[#06B6D4]'
                }`}
              >
                [2]
              </button>
              {scenario.answerParts.suffix}
            </p>

            <div className="mt-3 flex items-center justify-between border-t border-[#1E293B] pt-2 font-mono text-[9px] text-[#94A3B8]">
              <span>2 VERIFIED SOURCES</span>
              <span className="text-[#06B6D4]">{scenario.latency}</span>
            </div>
          </div>
        </div>

        {/* Mobile / Compact Flow (< md) */}
        <div className="space-y-3 md:hidden">
          <div className="grid grid-cols-2 gap-2">
            {DOCUMENTS.map((doc) => {
              const isActive = scenario.activeDocs.includes(doc.id);
              const isGated = scenario.gatedDocs.includes(doc.id);
              const isFocused = focusedDocId === doc.id;
              return (
                <button
                  key={doc.id}
                  type="button"
                  onClick={() => handleSelectDoc(doc.id)}
                  className={`rounded border px-2.5 py-2 text-left transition-colors ${
                    isFocused
                      ? 'border-[#06B6D4] bg-[#101827]'
                      : isActive
                        ? 'border-[#2563EB]/70 bg-[#101827]/90'
                        : 'border-[#1E293B] bg-[#050812]/80 opacity-60'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <FormatIcon format={doc.format} active={isActive} />
                    <span className="truncate font-mono text-[10px] text-[#F1F5F9]">
                      {doc.title}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between font-mono text-[9px] text-[#94A3B8]">
                    <span>{doc.format}</span>
                    <span>{isGated ? 'SQL-GATED' : `${doc.chunks} chunks`}</span>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between rounded border border-[#2563EB]/50 bg-[#101827] px-3 py-2 font-mono text-[10px]">
            <span className="flex items-center gap-1.5 text-[#F1F5F9]">
              <Sparkles className="h-3 w-3 text-[#06B6D4]" />
              CHUNK &rarr; PGVECTOR + BM25
            </span>
            <span className="text-[#06B6D4]">RRF {scenario.rrfTop[0]?.rrf}</span>
          </div>

          <div className="rounded border border-[#1E293B] bg-[#101827] p-3">
            <div className="flex items-center justify-between font-mono text-[10px] text-[#06B6D4]">
              <span>GROUNDED RESPONSE</span>
              <span>{scenario.latency}</span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-[#F1F5F9]">
              {scenario.answerParts.prefix}
              <button
                type="button"
                onClick={() => {
                  setIsPaused(true);
                  setSelectedCitationIdx(1);
                }}
                className={`mx-0.5 inline-flex rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
                  selectedCitationIdx === 1
                    ? 'bg-[#06B6D4] text-[#050812]'
                    : 'bg-[#2563EB]/20 text-[#60A5FA]'
                }`}
              >
                [1]
              </button>
              {scenario.answerParts.middle}
              <button
                type="button"
                onClick={() => {
                  setIsPaused(true);
                  setSelectedCitationIdx(2);
                }}
                className={`mx-0.5 inline-flex rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
                  selectedCitationIdx === 2
                    ? 'bg-[#06B6D4] text-[#050812]'
                    : 'bg-[#2563EB]/20 text-[#60A5FA]'
                }`}
              >
                [2]
              </button>
              {scenario.answerParts.suffix}
            </p>
          </div>
        </div>
      </div>

      {/* Bottom Source-Level Citation Inspector */}
      <div className="relative z-10 border-t border-[#1E293B] bg-[#050812]/90 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10px]">
            <span className="inline-flex items-center whitespace-nowrap rounded bg-[#06B6D4]/15 px-1.5 py-0.5 font-semibold text-[#06B6D4]">
              CITATION [{activeCitation.index}]
            </span>
            <ArrowRight className="h-3 w-3 shrink-0 text-[#94A3B8]" />
            <span className="text-[#F1F5F9]">{activeCitation.source}</span>
            <span className="text-[#94A3B8]">· {activeCitation.section}</span>
          </div>
          <span className="font-mono text-[10px] text-[#94A3B8] whitespace-nowrap">
            {activeCitation.location} · COSINE {activeCitation.score}
          </span>
        </div>
        <p className="mt-1.5 border-l-2 border-[#06B6D4]/70 pl-3 text-xs leading-relaxed text-[#94A3B8]">
          &ldquo;{activeCitation.excerpt}&rdquo;
        </p>
      </div>
    </div>
  );
}
