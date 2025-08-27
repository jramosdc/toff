'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

interface TimeOffRequest {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  start_date: string;
  end_date: string;
  type: 'VACATION' | 'SICK' | 'PAID_LEAVE';
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reason?: string;
}

interface OvertimeRequest {
  id: string;
  user_id?: string;
  user_name?: string;
  hours: number;
  request_date: string;
  month: number;
  year: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  notes?: string;
}

// Helper function to safely format dates
const formatDate = (dateString: string) => {
  try {
    const date = new Date(dateString);
    // Check if date is valid
    if (isNaN(date.getTime())) {
      return 'Invalid Date';
    }
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  } catch (error) {
    console.error('Error formatting date:', dateString, error);
    return 'Invalid Date';
  }
};

export default function AllRequestsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [requests, setRequests] = useState<TimeOffRequest[]>([]);
  const [overtimeRequests, setOvertimeRequests] = useState<OvertimeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [processingRequests, setProcessingRequests] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    } else if (session?.user?.role !== 'ADMIN') {
      router.push('/dashboard');
    } else if (status === 'authenticated') {
      fetchRequests();
      fetchOvertime();
    }
  }, [session, status, router, currentYear, statusFilter]);

  const fetchRequests = async () => {
    try {
      setLoading(true);
      let url = `/api/admin/requests?year=${currentYear}`;
      if (statusFilter) {
        url += `&status=${statusFilter}`;
      }
      
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setRequests(data);
        setError(''); // Clear any previous errors
      } else {
        const errorText = await response.text();
        setError(`Failed to fetch requests: ${errorText}`);
      }
    } catch (err) {
      setError('An error occurred while fetching data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchOvertime = async () => {
    try {
      const res = await fetch('/api/overtime/requests');
      if (res.ok) {
        const data = await res.json();
        setOvertimeRequests(data);
      }
    } catch (err) {
      console.error('Failed to fetch overtime requests', err);
    }
  };

  const updateRequestStatus = async (requestId: string, newStatus: 'PENDING' | 'APPROVED' | 'REJECTED') => {
    // Add to processing set to show loading state
    setProcessingRequests(prev => new Set(prev).add(requestId));
    
    // Optimistic update - immediately update UI
    const originalRequests = [...requests];
    setRequests(prevRequests => 
      prevRequests.map(request => 
        request.id === requestId 
          ? { ...request, status: newStatus } 
          : request
      )
    );

    try {
      const response = await fetch(`/api/time-off/requests/${requestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update request status');
      }

      // Clear any previous errors on success
      setError('');
      
      // Show success message briefly
      const successMessage = `Request ${newStatus.toLowerCase()} successfully!`;
      setError(successMessage);
      setTimeout(() => {
        if (error === successMessage) {
          setError('');
        }
      }, 3000);

    } catch (err) {
      // Revert optimistic update on error
      setRequests(originalRequests);
      
      const errorMessage = err instanceof Error ? err.message : 'An error occurred while updating request';
      setError(errorMessage);
      console.error('Error updating request:', err);
    } finally {
      // Remove from processing set
      setProcessingRequests(prev => {
        const newSet = new Set(prev);
        newSet.delete(requestId);
        return newSet;
      });
    }
  };

  const updateOvertimeStatus = async (requestId: string, newStatus: 'APPROVED' | 'REJECTED') => {
    if (newStatus === 'APPROVED') {
      const req = overtimeRequests.find(r => r.id === requestId);
      const days = req ? (req.hours / 8).toFixed(2) : undefined;
      const ok = typeof window !== 'undefined' ? window.confirm(`Approve this overtime? This will add ${days ?? '?'} day(s) to VACATION.`) : true;
      if (!ok) return;
    }
    setProcessingRequests(prev => new Set(prev).add(requestId));
    const original = [...overtimeRequests];
    setOvertimeRequests(prev => prev.map(r => r.id === requestId ? { ...r, status: newStatus } : r));
    try {
      const res = await fetch(`/api/overtime/requests/${requestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to update overtime status');
      }
      setError('');
      await fetchRequests(); // refresh balances-related view if needed
      await fetchOvertime();
    } catch (err) {
      setOvertimeRequests(original);
      console.error('Error updating overtime status', err);
    } finally {
      setProcessingRequests(prev => { const s = new Set(prev); s.delete(requestId); return s; });
    }
  };

  if (status === 'loading' || loading) {
    return <div className="flex justify-center items-center h-screen">Loading...</div>;
  }

  if (session?.user?.role !== 'ADMIN') {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-100 py-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Time Off Requests</h1>
          <div className="flex space-x-4">
            <button
              onClick={() => router.push('/admin')}
              className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
            >
              Back to Admin
            </button>
          </div>
        </div>

        {error && (
          <div className={`border px-4 py-3 rounded mb-4 ${
            error.includes('successfully') 
              ? 'bg-green-100 border-green-400 text-green-700'
              : 'bg-red-100 border-red-400 text-red-700'
          }`}>
            {error}
          </div>
        )}

        {/* Filters */}
        <div className="bg-white shadow sm:rounded-lg mb-8">
          <div className="px-4 py-5 sm:p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label htmlFor="year" className="block text-sm font-medium text-gray-700">Year</label>
                <select
                  id="year"
                  className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                  value={currentYear}
                  onChange={(e) => setCurrentYear(parseInt(e.target.value))}
                >
                  {Array.from({ length: 5 }, (_, i) => currentYear - 2 + i).map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="status" className="block text-sm font-medium text-gray-700">Status</label>
                <select
                  id="status"
                  className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                  value={statusFilter || ''}
                  onChange={(e) => setStatusFilter(e.target.value || null)}
                >
                  <option value="">All Statuses</option>
                  <option value="PENDING">Pending</option>
                  <option value="APPROVED">Approved</option>
                  <option value="REJECTED">Rejected</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Requests Table */}
        <div className="bg-white shadow overflow-hidden sm:rounded-lg">
          <div className="p-4">
            <div className="bg-blue-50 border-l-4 border-blue-400 p-4 mb-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm text-blue-700">
                    <strong>Note:</strong> Time off calculations automatically exclude weekends and holidays. Only working days are counted towards the time off balance.
                  </p>
                  <ul className="text-sm text-blue-700 mt-1 list-disc list-inside pl-2">
                    <li>All federal holidays</li>
                    <li>Good Friday (April 18, 2025)</li>
                    <li>Christmas Eve (December 24)</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Employee
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Dates
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Reason
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {requests.length > 0 ? (
                  requests.map((request) => (
                    <tr key={request.id}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{request.user_name}</div>
                        <div className="text-sm text-gray-500">{request.user_email}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {request.type.replace('_', ' ')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                        {formatDate(request.start_date)} - {formatDate(request.end_date)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            request.status === 'APPROVED'
                              ? 'bg-green-100 text-green-800'
                              : request.status === 'REJECTED'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-yellow-100 text-yellow-800'
                          }`}
                        >
                          {request.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                        {request.reason || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        {request.status === 'PENDING' && (
                          <>
                            <button
                              onClick={() => updateRequestStatus(request.id, 'APPROVED')}
                              disabled={processingRequests.has(request.id)}
                              className={`mr-4 ${
                                processingRequests.has(request.id)
                                  ? 'text-gray-400 cursor-not-allowed'
                                  : 'text-green-600 hover:text-green-900'
                              }`}
                            >
                              {processingRequests.has(request.id) ? 'Processing...' : 'Approve'}
                            </button>
                            <button
                              onClick={() => updateRequestStatus(request.id, 'REJECTED')}
                              disabled={processingRequests.has(request.id)}
                              className={`${
                                processingRequests.has(request.id)
                                  ? 'text-gray-400 cursor-not-allowed'
                                  : 'text-red-600 hover:text-red-900'
                              }`}
                            >
                              {processingRequests.has(request.id) ? 'Processing...' : 'Reject'}
                            </button>
                          </>
                        )}
                        {request.status !== 'PENDING' && (
                          <button
                            onClick={() => router.push(`/admin/employee/${request.user_id}`)}
                            className="text-indigo-600 hover:text-indigo-900"
                          >
                            View Calendar
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="px-6 py-4 text-center text-sm text-gray-500">
                      No time off requests found with the selected filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Overtime Requests Table */}
        <div className="bg-white shadow overflow-hidden sm:rounded-lg mt-8">
          <div className="p-4">
            <h2 className="text-xl font-semibold mb-2">Overtime Requests</h2>
            <p className="text-sm text-gray-600 mb-4">Approve to add equivalent vacation days (hours ÷ 8) to the employee's balance.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Hours</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Equivalent Days</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Notes</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {overtimeRequests.length > 0 ? (
                  overtimeRequests.map((r) => (
                    <tr key={r.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{r.request_date}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{r.hours}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{(r.hours / 8).toFixed(2)}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          r.status === 'APPROVED' ? 'bg-green-100 text-green-800' : r.status === 'REJECTED' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{r.notes || '-'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        {r.status === 'PENDING' ? (
                          <>
                            <button
                              onClick={() => updateOvertimeStatus(r.id, 'APPROVED')}
                              disabled={processingRequests.has(r.id)}
                              className={`mr-4 ${processingRequests.has(r.id) ? 'text-gray-400 cursor-not-allowed' : 'text-green-600 hover:text-green-900'}`}
                            >
                              {processingRequests.has(r.id) ? 'Processing...' : 'Approve'}
                            </button>
                            <button
                              onClick={() => updateOvertimeStatus(r.id, 'REJECTED')}
                              disabled={processingRequests.has(r.id)}
                              className={`${processingRequests.has(r.id) ? 'text-gray-400 cursor-not-allowed' : 'text-red-600 hover:text-red-900'}`}
                            >
                              {processingRequests.has(r.id) ? 'Processing...' : 'Reject'}
                            </button>
                          </>
                        ) : (
                          <span className="text-gray-500">—</span>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="px-6 py-4 text-center text-sm text-gray-500">No overtime requests found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
} 