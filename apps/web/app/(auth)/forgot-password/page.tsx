'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { LockedCopy } from '@xs-rag/shared';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await apiClient.post('/auth/forgot-password', { email });
    } catch {
      // Per spec, forgot-password always appears to succeed to prevent user enumeration
    } finally {
      setLoading(false);
      setSubmitted(true);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Forgot Password</CardTitle>
        <CardDescription>
          Enter your email address and we will send you a link to reset your password
        </CardDescription>
      </CardHeader>
      {submitted ? (
        <CardContent className="space-y-4">
          <div
            role="status"
            data-testid="status-alert"
            className="rounded-md bg-blue-50 p-4 text-sm font-medium text-blue-800 border border-blue-200 dark:bg-blue-950 dark:text-blue-200 dark:border-blue-800"
          >
            {LockedCopy.RESET_SENT}
          </div>
          <div className="pt-2 text-center">
            <Link
              href="/login"
              className="text-sm font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400"
            >
              Back to Sign In
            </Link>
          </div>
        </CardContent>
      ) : (
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
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
          </CardContent>
          <CardFooter className="flex flex-col space-y-4">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Sending...' : 'Send Reset Link'}
            </Button>
            <p className="text-center text-sm text-gray-600 dark:text-gray-400">
              Remember your password?{' '}
              <Link href="/login" className="font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400">
                Sign in
              </Link>
            </p>
          </CardFooter>
        </form>
      )}
    </Card>
  );
}
