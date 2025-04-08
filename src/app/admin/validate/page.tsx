'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

interface ValidationIssue {
  type: 'OVERLAP' | 'CALCULATION_MISMATCH' | 'INVALID_RANGE';
  message: string;
  requestId?: string;
  details?: any;
}

interface ValidationResult {
  userId: string;
  userName: string;
  issues: ValidationIssue[];
}

interface ValidationResponse {
  totalUsers: number;
  totalRequests: number;
  usersWithIssues: number;
  validationResults: ValidationResult[];
}

export default function ValidatePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [validationData, setValidationData] = useState<ValidationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    } else if (session?.user?.role !== 'ADMIN') {
      router.push('/dashboard');
    } else {
      fetchValidationData();
    }
  }, [session, status]);

  const fetchValidationData = async () => {
    try {
      setLoading(true);
      setError('');
      
      const response = await fetch('/api/admin/validate-time-off');
      if (!response.ok) {
        throw new Error('Failed to fetch validation data');
      }
      
      const data = await response.json();
      setValidationData(data);
    } catch (err) {
      setError('An error occurred while fetching validation data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (status === 'loading' || loading) {
    return <div className="flex justify-center items-center h-screen">Loading...</div>;
  }

  if (session?.user?.role !== 'ADMIN') {
    return null;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Time Off Request Validation</h1>
      
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}
      
      {validationData && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-white p-4 rounded-lg shadow">
              <h3 className="text-lg font-semibold mb-2">Total Users</h3>
              <p className="text-2xl">{validationData.totalUsers}</p>
            </div>
            <div className="bg-white p-4 rounded-lg shadow">
              <h3 className="text-lg font-semibold mb-2">Total Requests</h3>
              <p className="text-2xl">{validationData.totalRequests}</p>
            </div>
            <div className="bg-white p-4 rounded-lg shadow">
              <h3 className="text-lg font-semibold mb-2">Users with Issues</h3>
              <p className="text-2xl">{validationData.usersWithIssues}</p>
            </div>
          </div>
          
          {validationData.validationResults.map((result) => (
            <div key={result.userId} className="bg-white rounded-lg shadow p-4">
              <h2 className="text-xl font-semibold mb-4">{result.userName}</h2>
              
              <div className="space-y-4">
                {result.issues.map((issue, index) => (
                  <div key={index} className="border-l-4 pl-4" style={{
                    borderColor: issue.type === 'OVERLAP' ? '#ef4444' : 
                               issue.type === 'CALCULATION_MISMATCH' ? '#f59e0b' : 
                               '#10b981'
                  }}>
                    <h3 className="font-medium mb-2">{issue.message}</h3>
                    {issue.details && (
                      <div className="bg-gray-50 p-3 rounded">
                        <pre className="text-sm">
                          {JSON.stringify(issue.details, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
} 