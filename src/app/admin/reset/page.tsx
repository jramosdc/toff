'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ResetDataPage() {
  const [isResetting, setIsResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any | null>(null);
  const [confirmValue, setConfirmValue] = useState('');
  const router = useRouter();

  const handleReset = async () => {
    if (confirmValue !== 'RESET') {
      setError('You must type RESET to confirm');
      return;
    }

    setIsResetting(true);
    setError(null);
    
    try {
      const response = await fetch('/api/admin/reset-data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ confirmReset: true }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to reset data');
      }
      
      const data = await response.json();
      setResult(data);
      
      // Reset the form
      setConfirmValue('');
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-2xl mx-auto bg-white p-8 rounded-lg shadow-lg">
        <h1 className="text-2xl font-bold mb-6 text-red-600">Reset Time Off Data</h1>
        
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-yellow-700">
                <strong>Warning:</strong> This action will permanently delete all time off and overtime requests. This cannot be undone.
              </p>
            </div>
          </div>
        </div>
        
        <div className="mb-6">
          <label htmlFor="confirm" className="block text-sm font-medium text-gray-700 mb-2">
            Type RESET to confirm
          </label>
          <input
            type="text"
            id="confirm"
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            value={confirmValue}
            onChange={(e) => setConfirmValue(e.target.value)}
            placeholder="RESET"
          />
        </div>
        
        {error && (
          <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-6">
            <div className="flex">
              <div className="ml-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            </div>
          </div>
        )}
        
        {result && (
          <div className="bg-green-50 border-l-4 border-green-400 p-4 mb-6">
            <div className="flex">
              <div className="ml-3">
                <p className="text-sm text-green-700">
                  <strong>Success:</strong> {result.message}
                </p>
                <p className="text-sm text-green-700 mt-2">
                  Deleted {result.details.deletedTimeOffRequests} time off requests and {result.details.deletedOvertimeRequests} overtime requests.
                </p>
              </div>
            </div>
          </div>
        )}
        
        <div className="flex justify-between">
          <button
            type="button"
            className="px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            onClick={() => router.push('/admin')}
          >
            Back to Admin
          </button>
          
          <button
            type="button"
            className={`px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white ${
              isResetting ? 'bg-red-300' : 'bg-red-600 hover:bg-red-700'
            } focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500`}
            onClick={handleReset}
            disabled={isResetting || confirmValue !== 'RESET'}
          >
            {isResetting ? 'Resetting...' : 'Reset All Time Off Data'}
          </button>
        </div>
      </div>
    </div>
  );
} 