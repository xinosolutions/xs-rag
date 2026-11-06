import { DemoView, DemoData } from '@/components/demo/demo-view';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

async function getDemoData(): Promise<DemoData | null> {
  try {
    const res = await fetch(`${API_BASE}/public/demo`, {
      cache: 'no-store',
    });
    if (!res.ok) {
      return null;
    }
    return (await res.json()) as DemoData;
  } catch {
    return null;
  }
}

export default async function DemoPage() {
  const demoData = await getDemoData();

  if (!demoData) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 dark:bg-gray-950">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Demo Workspace Not Available
          </h1>
          <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
            The demo workspace has not been initialized yet. Run the database seed script to set up sample documents and example questions.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link href="/">
              <Button variant="outline">Back to Home</Button>
            </Link>
            <Link href="/login">
              <Button>Sign In</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <DemoView demoData={demoData} />;
}
