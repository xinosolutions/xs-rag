'use client';

import React, { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { LockedCopy } from '@xs-rag/shared';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';

function LoginForm() {
  const searchParams = useSearchParams();
  const nextUrl = searchParams.get('next');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await apiClient.post('/auth/login', { email, password });
      const destination = nextUrl && nextUrl.startsWith('/') ? nextUrl : '/w';
      window.location.href = destination;
    } catch (err: unknown) {
      const status = typeof err === 'object' && err !== null && 'status' in err ? (err as { status: number }).status : 0;
      const message = typeof err === 'object' && err !== null && 'message' in err ? (err as { message: string }).message : '';
      if (status === 401) {
        setError(LockedCopy.LOGIN_FAILED);
      } else {
        setError(message || LockedCopy.LOGIN_FAILED);
      }
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign In</CardTitle>
        <CardDescription>Enter your credentials to access your workspaces</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {error && (
            <div
              role="alert"
              data-testid="error-alert"
              className="rounded-md bg-red-50 p-3 text-sm font-medium text-red-800 border border-red-200 dark:bg-red-950 dark:text-red-200 dark:border-red-800"
            >
              {error}
            </div>
          )}
          <div className="space-y-1">
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Email
            </label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Password
              </label>
              <Link
                href="/forgot-password"
                className="text-xs text-blue-600 hover:text-blue-500 dark:text-blue-400"
              >
                Forgot password?
              </Link>
            </div>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col space-y-4">
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </Button>
          <p className="text-center text-sm text-gray-600 dark:text-gray-400">
            Don&apos;t have an account?{' '}
            <Link
              href={nextUrl ? `/register?next=${encodeURIComponent(nextUrl)}` : '/register'}
              className="font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400"
            >
              Sign up
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="text-center p-4">Loading...</div>}>
      <LoginForm />
    </Suspense>
  );
}
