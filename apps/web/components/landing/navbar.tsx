'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';

/**
 * Sticky enterprise navigation bar with subtle scroll-triggered depth transition,
 * hairline borders, and minimal active-state indicators.
 */
export function LandingNavbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 12);
    };

    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-40 transition-all duration-300 backdrop-blur-md ${
        scrolled
          ? 'bg-[#050812]/95 border-b border-[#1E293B] shadow-[0_10px_30px_-15px_rgba(0,0,0,0.85)]'
          : 'bg-[#050812]/70 border-b border-[#1E293B]/60'
      }`}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand Emblem & Wordmark */}
        <Link
          href="/"
          className="group flex shrink-0 items-center gap-2.5 sm:gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] rounded-sm"
        >
          <div className="relative flex h-8 w-8 shrink-0 items-center justify-center border border-[#1E293B] bg-[#101827] transition-colors duration-200 group-hover:border-[#2563EB]/70">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
              className="h-4 w-4 text-[#F1F5F9]"
            >
              <path
                d="M4 7H9M4 12H13M4 17H9"
                stroke="#2563EB"
                strokeWidth="1.75"
                strokeLinecap="square"
              />
              <rect x="13" y="5" width="4" height="4" stroke="#06B6D4" strokeWidth="1.5" />
              <rect x="16" y="10" width="4" height="4" fill="#2563EB" />
              <rect x="13" y="15" width="4" height="4" stroke="#94A3B8" strokeWidth="1.5" />
            </svg>
            <span className="absolute -bottom-px -right-px h-1.5 w-1.5 bg-[#06B6D4]" />
          </div>
          <div className="flex items-center gap-2.5">
            <span className="whitespace-nowrap font-sans text-base font-semibold tracking-tight text-[#F1F5F9]">
              xs-RAG
            </span>
            <span className="hidden sm:inline-flex items-center gap-1.5 border-l border-[#1E293B] pl-2.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[#94A3B8] whitespace-nowrap">
              <span className="h-1.5 w-1.5 rounded-full bg-[#06B6D4]" />
              RAG CORE
            </span>
          </div>
        </Link>

        {/* Primary Navigation Links */}
        <nav aria-label="Primary navigation" className="flex shrink-0 items-center gap-1.5 sm:gap-3">
          <Link
            href="/demo"
            data-testid="nav-demo-link"
            className="group relative inline-flex h-9 items-center gap-1.5 whitespace-nowrap px-2.5 sm:px-3 text-xs font-medium text-[#94A3B8] transition-colors duration-200 hover:text-[#F1F5F9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
          >
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#06B6D4] transition-transform duration-200 group-hover:scale-125" />
            <span>Demo</span>
            <span className="absolute inset-x-2.5 sm:inset-x-3 bottom-0 h-px origin-left scale-x-0 bg-[#06B6D4] transition-transform duration-200 group-hover:scale-x-100" />
          </Link>

          <Link
            href="/login"
            data-testid="nav-login-link"
            className="relative inline-flex h-9 items-center whitespace-nowrap rounded-md border border-[#1E293B] bg-[#090F1C] px-2.5 sm:px-3.5 text-xs font-medium text-[#F1F5F9] transition-all duration-200 hover:border-[#2563EB]/70 hover:bg-[#101827] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
          >
            Sign In
          </Link>

          <Link
            href="/register"
            data-testid="nav-register-link"
            className="group inline-flex h-9 items-center gap-1 whitespace-nowrap rounded-md border border-[#2563EB] bg-[#2563EB] px-2.5 sm:px-3.5 text-xs font-medium text-white shadow-[0_0_20px_-6px_rgba(37,99,235,0.65)] transition-all duration-200 hover:bg-[#1D4ED8] hover:border-[#3B82F6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#06B6D4]"
          >
            <span>Get Started</span>
            <ArrowUpRight className="h-3.5 w-3.5 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </Link>
        </nav>
      </div>
    </header>
  );
}
