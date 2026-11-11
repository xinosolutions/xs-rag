import React from 'react';
import Link from 'next/link';

/**
 * Enterprise landing footer with copyright notice and direct route links.
 */
export function LandingFooter() {
  return (
    <footer className="border-t border-[#1E293B] bg-[#050812] py-10 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 text-xs text-[#94A3B8] sm:flex-row">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-2 w-2 rounded-full bg-[#2563EB]" />
          <p>© {new Date().getFullYear()} xs-RAG Document Assistant. Built for enterprise reliability.</p>
        </div>

        <nav aria-label="Footer navigation" className="flex items-center gap-6">
          <Link
            href="/demo"
            className="transition-colors duration-200 hover:text-[#F1F5F9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] rounded-sm"
          >
            Public Demo
          </Link>
          <Link
            href="/login"
            className="transition-colors duration-200 hover:text-[#F1F5F9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] rounded-sm"
          >
            Sign In
          </Link>
          <Link
            href="/register"
            className="transition-colors duration-200 hover:text-[#F1F5F9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] rounded-sm"
          >
            Register
          </Link>
        </nav>
      </div>
    </footer>
  );
}

