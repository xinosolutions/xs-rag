import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 dark:bg-gray-950">
      <div className="text-center">
        <h1 className="text-6xl font-extrabold text-blue-600 dark:text-blue-500">404</h1>
        <h2 className="mt-4 text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
          Page Not Found
        </h2>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          The page or resource you are looking for does not exist or has been removed.
        </p>
        <div className="mt-6">
          <Link href="/">
            <Button variant="primary">Back to Home</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
