import Link from 'next/link';
import { ArrowRight, ShieldCheck, Layers } from 'lucide-react';
import { LandingNavbar } from '@/components/landing/navbar';
import { RagVisualization } from '@/components/landing/rag-visualization';
import { PipelineSection } from '@/components/landing/pipeline-section';
import { CapabilitiesSection } from '@/components/landing/capabilities-section';
import { ArchitectureCta } from '@/components/landing/architecture-cta';
import { LandingFooter } from '@/components/landing/footer';

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-[#050812] text-[#F1F5F9] font-sans antialiased selection:bg-[#2563EB]/30 selection:text-[#F1F5F9]">
      <LandingNavbar />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative overflow-hidden py-14 sm:py-20 lg:py-24 px-4 sm:px-6 lg:px-8">
          {/* Fine Architectural Grid & Subtle Radial Blue/Cyan Illumination */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-infra-grid opacity-35 [mask-image:radial-gradient(ellipse_at_top,black_35%,transparent_80%)]"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-32 left-1/4 h-[460px] w-[560px] -translate-x-1/2 rounded-full blur-3xl"
            style={{
              background: 'radial-gradient(circle, rgba(37, 99, 235, 0.14), transparent 70%)',
            }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-20 right-1/4 h-[380px] w-[420px] translate-x-1/3 rounded-full blur-3xl"
            style={{
              background: 'radial-gradient(circle, rgba(6, 182, 212, 0.07), transparent 70%)',
            }}
          />

          <div className="relative mx-auto max-w-7xl">
            <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-12 lg:gap-10">
              {/* Hero Content */}
              <div className="lg:col-span-5 space-y-6">
                {/* Technical Status Badge */}
                <div className="inline-flex flex-wrap items-center gap-2 rounded border border-[#1E293B] bg-[#090F1C] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[#94A3B8]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#06B6D4]" />
                  <span className="text-[#F1F5F9]">RETRIEVAL ENGINE</span>
                  <span className="text-[#1E293B]">|</span>
                  <span className="text-[#06B6D4]">SOURCE VERIFICATION</span>
                </div>

                <h1 className="font-sans text-4xl sm:text-5xl xl:text-[3.35rem] font-bold tracking-[-0.03em] text-[#F1F5F9] leading-[1.08] text-balance">
                  Instant, cited answers across your team&apos;s documents.
                </h1>

                <p className="text-base sm:text-lg leading-relaxed text-[#94A3B8] max-w-xl">
                  xs-RAG transforms organizational knowledge into a searchable intelligence layer.
                  Retrieve precise information from your documents, generate grounded answers, and
                  verify every claim with source-level citations.
                </p>

                {/* Hero CTAs */}
                <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-3 pt-2">
                  <Link
                    href="/demo"
                    data-testid="demo-link"
                    className="group inline-flex h-12 items-center justify-center gap-2 rounded-md border border-[#2563EB] bg-[#2563EB] px-6 text-sm font-medium text-white shadow-[0_0_28px_-6px_rgba(37,99,235,0.7)] transition-all duration-200 hover:bg-[#1D4ED8] hover:border-[#3B82F6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#06B6D4]"
                  >
                    <span>Try Live Demo</span>
                    <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                  </Link>

                  <Link
                    href="/register"
                    data-testid="register-link"
                    className="inline-flex h-12 items-center justify-center rounded-md border border-[#1E293B] bg-[#101827] px-6 text-sm font-medium text-[#F1F5F9] transition-all duration-200 hover:border-[#06B6D4]/70 hover:bg-[#101827]/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
                  >
                    Create Workspace
                  </Link>

                  <Link
                    href="/login"
                    data-testid="login-link"
                    className="inline-flex h-12 items-center justify-center px-4 text-sm font-medium text-[#94A3B8] transition-colors duration-200 hover:text-[#F1F5F9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] rounded-md"
                  >
                    Sign In
                  </Link>
                </div>

                {/* Compact Technical Verification Strip */}
                <div className="pt-4 border-t border-[#1E293B]/80 grid grid-cols-2 gap-4 max-w-md font-mono text-[11px]">
                  <div className="flex items-start gap-2">
                    <ShieldCheck className="h-4 w-4 shrink-0 text-[#06B6D4] mt-0.5" strokeWidth={1.6} />
                    <div>
                      <div className="text-[#F1F5F9]">SQL Permission Gate</div>
                      <div className="text-[10px] text-[#94A3B8]">Filtered pre-ranking</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Layers className="h-4 w-4 shrink-0 text-[#2563EB] mt-0.5" strokeWidth={1.6} />
                    <div>
                      <div className="text-[#F1F5F9]">Hybrid RRF Search</div>
                      <div className="text-[10px] text-[#94A3B8]">pgvector + BM25 index</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Hero RAG Infrastructure Visualization */}
              <div className="lg:col-span-7">
                <RagVisualization />
              </div>
            </div>
          </div>
        </section>

        {/* Interactive 5-Stage Pipeline Experience */}
        <PipelineSection />

        {/* Core Capabilities Architectural Matrix */}
        <CapabilitiesSection />

        {/* Enterprise Verification CTA Strip */}
        <ArchitectureCta />
      </main>

      <LandingFooter />
    </div>
  );
}
