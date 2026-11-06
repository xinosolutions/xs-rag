'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { LockedCopy } from '@xs-rag/shared';
import { apiClient, ApiClientError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';

export default function ResetPasswordPage() {
  const params = useParams();
  const token = typeof params.token === 'string' ? params.token : '';

  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await apiClient.post('/auth/reset-password', {
        token,
        password,
      });
      setSuccess(true);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError(LockedCopy.GENERIC_ERROR);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reset Password</CardTitle>
        <CardDescription>Enter a new password for your account</CardDescription>
      </CardHeader>
      {success ? (
        <CardContent className="space-y-4">
          <div
            role="status"
            className="rounded-md bg-green-50 p-4 text-sm font-medium text-green-800 border border-green-200 dark:bg-green-950 dark:text-green-200 dark:border-green-800"
          >
            Password has been reset successfully.
          </div>
          <div className="pt-2 text-center">
            <Link
              href="/login"
              className="text-sm font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400"
            >
              Sign in with your new password
            </Link>
          </div>
        </CardContent>
      ) : (
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {error && (
              <div
                role="alert"
                className="rounded-md bg-red-50 p-3 text-sm font-medium text-red-800 border border-red-200 dark:bg-red-950 dark:text-red-200 dark:border-red-800"
              >
                {error}
              </div>
            )}
            <div className="space-y-1">
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                New Password
              </label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={10}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 10 characters"
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col space-y-4">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Resetting password...' : 'Set New Password'}
            </Button>
            <p className="text-center text-sm text-gray-600 dark:text-gray-400">
              <Link href="/login" className="font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400">
                Back to Sign In
              </Link>
            </p>
          </CardFooter>
        </form>
      )}
    </Card>
  );
}
