import React from 'react';
import Link from 'next/link';
import { ArrowRight, Terminal } from 'lucide-react';
import { Reveal } from './reveal';

/**
 * Compact infrastructure deployment strip bridging the capabilities matrix and footer.
 */
export function ArchitectureCta() {
  return (
    <section className="relative border-t border-[#1E293B] bg-[#090F1C] py-16 px-4 sm:px-6 lg:px-8">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(60% 100% at 50% 0%, rgba(37, 99, 235, 0.08), transparent 70%)',
        }}
      />

      <div className="relative mx-auto max-w-7xl">
        <Reveal>
          <div className="relative overflow-hidden rounded-lg border border-[#1E293B] bg-[#050812] p-6 sm:p-10">
            <div className="pointer-events-none absolute inset-0 bg-infra-dots opacity-40 [mask-image:linear-gradient(to_right,transparent,black_30%,black_70%,transparent)]" />

            <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-2xl space-y-2.5">
                <div className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-[#06B6D4]">
                  <Terminal className="h-3.5 w-3.5" />
                  <span>LIVE WORKSPACE VERIFICATION</span>
                </div>
                <h2 className="font-sans text-2xl sm:text-3xl font-bold tracking-tight text-[#F1F5F9]">
                  Inspect grounded citations against real documents
                </h2>
                <p className="text-sm leading-relaxed text-[#94A3B8]">
                  Launch the unauthenticated public demo workspace with pre-indexed company policies,
                  or create a dedicated multi-user workspace in minutes.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
                <Link
                  href="/demo"
                  className="group inline-flex h-11 items-center justify-center gap-2 rounded-md border border-[#2563EB] bg-[#2563EB] px-6 text-sm font-medium text-white shadow-[0_0_24px_-6px_rgba(37,99,235,0.65)] transition-all duration-200 hover:bg-[#1D4ED8] hover:border-[#3B82F6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#06B6D4]"
                >
                  <span>Explore Public Demo</span>
                  <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                </Link>

                <Link
                  href="/register"
                  className="inline-flex h-11 items-center justify-center rounded-md border border-[#1E293B] bg-[#101827] px-6 text-sm font-medium text-[#F1F5F9] transition-all duration-200 hover:border-[#06B6D4]/70 hover:bg-[#101827]/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
                >
                  Create Workspace
                </Link>
              </div>
            </div>

            <div className="relative mt-6 pt-5 border-t border-[#1E293B]/80 flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-[11px] text-[#94A3B8]">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-[#06B6D4]" />
                HYBRID PGVECTOR + BM25
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-[#2563EB]" />
                SQL ROLE PERMISSIONS
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-[#06B6D4]" />
                PASSAGE-LEVEL CITATIONS
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-[#2563EB]" />
                CSP WIDGET EMBEDDING
              </span>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

