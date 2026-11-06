'use client';

import React, { useState, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { UploadCloud } from 'lucide-react';
import { apiClient, ApiClientError } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

interface DocumentUploadProps {
  wid: string;
}

export function DocumentUpload({ wid }: DocumentUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const handleUpload = async (file: File) => {
    setIsUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      await apiClient.post(`/workspaces/${wid}/documents`, formData);
      await queryClient.invalidateQueries({ queryKey: queryKeys.documents.list(wid) });
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('Failed to upload file.');
      }
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      handleUpload(file);
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      handleUpload(file);
    }
  };

  return (
    <div className="w-full">
      <div
        data-testid="dropzone"
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 cursor-pointer transition-colors ${
          isDragging
            ? 'border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-950/20'
            : 'border-gray-300 bg-gray-50/50 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800/30 dark:hover:bg-gray-800/50'
        }`}
      >
        <UploadCloud className="h-10 w-10 text-gray-400 dark:text-gray-500 mb-2" />
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {isDragging ? 'Drop file here to upload' : 'Drag & drop a file here, or click to browse'}
        </p>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Supported formats: .pdf, .docx, .md, .markdown (max 20 MB)
        </p>
        <input
          ref={fileInputRef}
          type="file"
          data-testid="file-upload-input"
          accept=".pdf,.docx,.md,.markdown"
          onChange={onFileChange}
          className="hidden"
          disabled={isUploading}
        />
        {isUploading && (
          <div className="mt-3 text-xs font-semibold text-blue-600 dark:text-blue-400">
            Uploading document...
          </div>
        )}
      </div>

      {error && (
        <div
          data-testid="upload-error"
          className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
        >
          {error}
        </div>
      )}
    </div>
  );
}
