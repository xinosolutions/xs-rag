import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className = '', type = 'text', error, ...props }, ref) => {
    return (
      <input
        type={type}
        ref={ref}
        className={`flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
          error
            ? 'border-red-500 focus-visible:ring-red-500'
            : 'border-gray-300 dark:border-gray-700 focus-visible:ring-blue-500'
        } ${className}`}
        {...props}
      />
    );
  },
);

Input.displayName = 'Input';
