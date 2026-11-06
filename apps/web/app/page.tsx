import Link from 'next/link';
import {
  FileText,
  ShieldCheck,
  Search,
  CheckCircle2,
  Code2,
  Sparkles,
  ArrowRight,
  BarChart3,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-white text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      {/* Top Navbar */}
      <header className="border-b border-gray-100 dark:border-gray-800 bg-white/80 dark:bg-gray-950/80 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white font-bold shadow-sm">
              xs
            </div>
            <span className="font-bold text-lg tracking-tight">xs-RAG</span>
          </div>

          <div className="flex items-center gap-3">
            <Link href="/demo">
              <Button variant="ghost" size="sm" data-testid="nav-demo-link">
                Demo
              </Button>
            </Link>
            <Link href="/login">
              <Button variant="outline" size="sm" data-testid="nav-login-link">
                Sign In
              </Button>
            </Link>
            <Link href="/register">
              <Button size="sm" data-testid="nav-register-link">
                Get Started
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1">
        <section className="py-20 md:py-32 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto text-center space-y-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-blue-200 bg-blue-50 text-blue-700 text-xs font-semibold dark:border-blue-900 dark:bg-blue-950/60 dark:text-blue-300">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Private, Grounded Enterprise Document Q&A</span>
          </div>

          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-gray-900 dark:text-white leading-[1.15]">
            Instant, cited answers across your team&apos;s documents
          </h1>

          <p className="text-lg sm:text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto leading-relaxed">
            xs-RAG empowers organizations to index PDFs, DOCX, Markdown, and web pages.
            Every answer is strictly grounded in your files, tagged with verifiable source citations,
            and filtered with database-level access rules.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <Link href="/demo">
              <Button size="lg" className="h-12 px-8 text-base shadow-md w-full sm:w-auto gap-2" data-testid="demo-link">
                Try Live Demo
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/register">
              <Button variant="outline" size="lg" className="h-12 px-8 text-base w-full sm:w-auto" data-testid="register-link">
                Create Workspace
              </Button>
            </Link>
            <Link href="/login">
              <Button variant="ghost" size="lg" className="h-12 px-6 text-base text-gray-600 dark:text-gray-400 w-full sm:w-auto" data-testid="login-link">
                Sign In
              </Button>
            </Link>
          </div>
        </section>

        {/* Feature Grid */}
        <section className="border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/30 py-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto">
            <div className="text-center max-w-2xl mx-auto mb-16">
              <h2 className="text-xs uppercase tracking-wider font-bold text-blue-600 dark:text-blue-400 mb-2">
                Core Capabilities
              </h2>
              <p className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
                Engineered for security, accuracy, and zero drift
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {/* Feature 1 */}
              <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl border border-gray-200/80 dark:border-gray-800 shadow-sm space-y-3">
                <div className="h-10 w-10 rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400 flex items-center justify-center">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <h3 className="font-semibold text-lg text-gray-900 dark:text-gray-100">
                  Verifiable Citations
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                  Every factual claim includes clickable citations linking directly to exact passages, pages, and sections. If information isn&apos;t in your documents, it won&apos;t fabricate answers.
                </p>
              </div>

              {/* Feature 2 */}
              <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl border border-gray-200/80 dark:border-gray-800 shadow-sm space-y-3">
                <div className="h-10 w-10 rounded-xl bg-indigo-100 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400 flex items-center justify-center">
                  <Search className="h-5 w-5" />
                </div>
                <h3 className="font-semibold text-lg text-gray-900 dark:text-gray-100">
                  Hybrid BM25 + Vector Search
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                  High-precision reciprocal rank fusion fuses pgvector dense embeddings with PostgreSQL full-text search, capturing exact matches and conceptual synonyms alike.
                </p>
              </div>

              {/* Feature 3 */}
              <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl border border-gray-200/80 dark:border-gray-800 shadow-sm space-y-3">
                <div className="h-10 w-10 rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400 flex items-center justify-center">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <h3 className="font-semibold text-lg text-gray-900 dark:text-gray-100">
                  Strict Permission Filtering
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                  Role-based visibility (Admins Only, All Members, Selected) is filtered inside the SQL query before ranking—preventing sensitive text from ever reaching the prompt.
                </p>
              </div>

              {/* Feature 4 */}
              <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl border border-gray-200/80 dark:border-gray-800 shadow-sm space-y-3">
                <div className="h-10 w-10 rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400 flex items-center justify-center">
                  <FileText className="h-5 w-5" />
                </div>
                <h3 className="font-semibold text-lg text-gray-900 dark:text-gray-100">
                  Multi-Format Ingestion
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                  Extracts text and section hierarchies from PDF, DOCX, Markdown, and web URLs with automated SSRF protection, size caps, and chunk recovery workers.
                </p>
              </div>

              {/* Feature 5 */}
              <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl border border-gray-200/80 dark:border-gray-800 shadow-sm space-y-3">
                <div className="h-10 w-10 rounded-xl bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-400 flex items-center justify-center">
                  <BarChart3 className="h-5 w-5" />
                </div>
                <h3 className="font-semibold text-lg text-gray-900 dark:text-gray-100">
                  Automated Evaluation
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                  Continuous LLM-as-a-judge benchmarking tracks accuracy, faithfulness, and retrieval scores across model updates with side-by-side run comparisons.
                </p>
              </div>

              {/* Feature 6 */}
              <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl border border-gray-200/80 dark:border-gray-800 shadow-sm space-y-3">
                <div className="h-10 w-10 rounded-xl bg-cyan-100 text-cyan-600 dark:bg-cyan-950 dark:text-cyan-400 flex items-center justify-center">
                  <Code2 className="h-5 w-5" />
                </div>
                <h3 className="font-semibold text-lg text-gray-900 dark:text-gray-100">
                  Embeddable Chat Widget
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                  Drop a single script tag on any site to launch a floating assistant, protected by strict Content-Security-Policy frame-ancestors origin controls.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-100 dark:border-gray-800 py-8 px-4 text-center text-xs text-gray-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>© {new Date().getFullYear()} xs-RAG Document Assistant. Built for enterprise reliability.</p>
          <div className="flex gap-4">
            <Link href="/demo" className="hover:text-gray-900 dark:hover:text-gray-100 transition-colors">
              Public Demo
            </Link>
            <Link href="/login" className="hover:text-gray-900 dark:hover:text-gray-100 transition-colors">
              Sign In
            </Link>
            <Link href="/register" className="hover:text-gray-900 dark:hover:text-gray-100 transition-colors">
              Register
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
