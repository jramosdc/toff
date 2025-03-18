'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

interface TimeOffBalance {
  vacationDays: number;
  sickDays: number;
  paidLeave: number;
}

interface TimeOffRequest {
  id: string;
  user_id: string;
  start_date: string;
  end_date: string;
  type: 'VACATION' | 'SICK' | 'PAID_LEAVE';
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reason?: string;
  user_name?: string;
  created_at?: string;
  updated_at?: string;
}

interface OvertimeRequest {
  id: string;
  hours: number;
  request_date: string;
  month: number;
  year: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  notes?: string;
}

// Add this helper function to safely format dates
const formatDate = (dateString: string) => {
  try {
    console.log('Formatting date:', dateString);
    const date = new Date(dateString);
    // Check if date is valid
    if (isNaN(date.getTime())) {
      console.error('Invalid date:', dateString);
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

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [balance, setBalance] = useState<TimeOffBalance | null>(null);
  const [requests, setRequests] = useState<TimeOffRequest[]>([]);
  const [overtimeRequests, setOvertimeRequests] = useState<OvertimeRequest[]>([]);
  const [newRequest, setNewRequest] = useState({
    startDate: '',
    endDate: '',
    type: 'VACATION',
    reason: '',
  });
  const [newOvertimeRequest, setNewOvertimeRequest] = useState({
    hours: 0,
    notes: '',
  });
  const [overtimeError, setOvertimeError] = useState('');
  const [isLastWeek, setIsLastWeek] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    } else if (session?.user) {
      fetchBalance();
      fetchRequests();
      fetchOvertimeRequests();
      checkIfLastWeekOfMonth();
    }
  }, [session, status]);

  const checkIfLastWeekOfMonth = () => {
    const today = new Date();
    const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    const daysUntilEndOfMonth = lastDayOfMonth.getDate() - today.getDate();
    setIsLastWeek(daysUntilEndOfMonth < 7);
  };

  const fetchBalance = async () => {
    const response = await fetch('/api/time-off/balance');
    if (response.ok) {
      const data = await response.json();
      setBalance(data);
    }
  };

  const fetchRequests = async () => {
    const response = await fetch('/api/time-off/requests');
    if (response.ok) {
      const data = await response.json();
      console.log('Time off requests data:', data);
      setRequests(data);
    }
  };

  const fetchOvertimeRequests = async () => {
    const response = await fetch('/api/overtime/requests');
    if (response.ok) {
      const data = await response.json();
      setOvertimeRequests(data);
    }
  };

  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Rename fields to match expected API parameters
    const requestData = {
      startDate: newRequest.startDate,
      endDate: newRequest.endDate,
      type: newRequest.type,
      reason: newRequest.reason,
    };
    
    console.log('Submitting request:', requestData);
    
    const response = await fetch('/api/time-off/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestData),
    });

    if (response.ok) {
      setNewRequest({
        startDate: '',
        endDate: '',
        type: 'VACATION',
        reason: '',
      });
      fetchRequests();
      fetchBalance();
    }
  };

  const handleUpdateRequestStatus = async (requestId: string, status: string) => {
    const response = await fetch(`/api/time-off/requests/${requestId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });

    if (response.ok) {
      fetchRequests();
      fetchBalance();
    }
  };

  const handleSubmitOvertimeRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setOvertimeError('');
    
    if (!isLastWeek) {
      setOvertimeError('Overtime requests can only be submitted during the last week of the month');
      return;
    }
    
    if (newOvertimeRequest.hours <= 0) {
      setOvertimeError('Hours must be a positive number');
      return;
    }
    
    try {
      const response = await fetch('/api/overtime/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newOvertimeRequest),
      });
      
      if (response.ok) {
        setNewOvertimeRequest({
          hours: 0,
          notes: '',
        });
        fetchOvertimeRequests();
      } else {
        const data = await response.json();
        setOvertimeError(data.error || 'Failed to submit overtime request');
      }
    } catch (err) {
      setOvertimeError('An error occurred while submitting the request');
      console.error(err);
    }
  };

  const handleUpdateOvertimeStatus = async (requestId: string, status: string) => {
    try {
      const response = await fetch(`/api/overtime/requests/${requestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });

      if (response.ok) {
        fetchOvertimeRequests();
        fetchBalance();
      }
    } catch (err) {
      console.error('Error updating overtime status:', err);
    }
  };

  if (status === 'loading') {
    return <div>Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">
            Time Off Dashboard
            {session?.user?.role === 'ADMIN' && (
              <button
                onClick={() => router.push('/admin')}
                className="ml-4 px-4 py-2 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700"
              >
                Admin Panel
              </button>
            )}
          </h1>

          {/* Balance Display */}
          {balance && (
            <div className="bg-white overflow-hidden shadow rounded-lg divide-y divide-gray-200 mb-8">
              <div className="px-4 py-5 sm:p-6">
                <h2 className="text-lg font-medium text-gray-900 mb-4">
                  Your Balance
                </h2>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-sm font-medium text-gray-500">Vacation Days</p>
                    <p className="mt-1 text-3xl font-semibold text-gray-900">
                      {balance.vacationDays}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Sick Days</p>
                    <p className="mt-1 text-3xl font-semibold text-gray-900">
                      {balance.sickDays}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Paid Leave</p>
                    <p className="mt-1 text-3xl font-semibold text-gray-900">
                      {balance.paidLeave}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* New Request Form */}
          <div className="bg-white shadow rounded-lg mb-8">
            <div className="px-4 py-5 sm:p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">
                Request Time Off
              </h2>
              <form onSubmit={handleSubmitRequest} className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <label htmlFor="startDate" className="block text-sm font-medium text-gray-700">
                      Start Date
                    </label>
                    <input
                      type="date"
                      id="startDate"
                      required
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                      value={newRequest.startDate}
                      onChange={(e) =>
                        setNewRequest({ ...newRequest, startDate: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label htmlFor="endDate" className="block text-sm font-medium text-gray-700">
                      End Date
                    </label>
                    <input
                      type="date"
                      id="endDate"
                      required
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                      value={newRequest.endDate}
                      onChange={(e) =>
                        setNewRequest({ ...newRequest, endDate: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label htmlFor="type" className="block text-sm font-medium text-gray-700">
                      Type
                    </label>
                    <select
                      id="type"
                      required
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                      value={newRequest.type}
                      onChange={(e) =>
                        setNewRequest({ ...newRequest, type: e.target.value as any })
                      }
                    >
                      <option value="VACATION">Vacation</option>
                      <option value="SICK">Sick Leave</option>
                      <option value="PAID_LEAVE">Paid Leave</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label htmlFor="reason" className="block text-sm font-medium text-gray-700">
                    Reason
                  </label>
                  <textarea
                    id="reason"
                    rows={3}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                    value={newRequest.reason}
                    onChange={(e) =>
                      setNewRequest({ ...newRequest, reason: e.target.value })
                    }
                  />
                </div>
                <div>
                  <button
                    type="submit"
                    className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                  >
                    Submit Request
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* Overtime Request Form */}
          <div className="bg-white shadow rounded-lg mb-8">
            <div className="px-4 py-5 sm:p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">
                Request Overtime Compensation
              </h2>
              {overtimeError && (
                <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
                  {overtimeError}
                </div>
              )}
              {!isLastWeek && (
                <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded mb-4">
                  Overtime requests can only be submitted during the last week of the month.
                </div>
              )}
              <form onSubmit={handleSubmitOvertimeRequest} className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="hours" className="block text-sm font-medium text-gray-700">
                      Hours Worked
                    </label>
                    <input
                      type="number"
                      id="hours"
                      min="0.5"
                      step="0.5"
                      required
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                      value={newOvertimeRequest.hours}
                      onChange={(e) =>
                        setNewOvertimeRequest({
                          ...newOvertimeRequest,
                          hours: parseFloat(e.target.value),
                        })
                      }
                    />
                    <p className="mt-1 text-sm text-gray-500">
                      8 hours of overtime equals 1 vacation day
                    </p>
                  </div>
                  <div>
                    <label htmlFor="notes" className="block text-sm font-medium text-gray-700">
                      Notes
                    </label>
                    <textarea
                      id="notes"
                      rows={3}
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                      value={newOvertimeRequest.notes}
                      onChange={(e) =>
                        setNewOvertimeRequest({
                          ...newOvertimeRequest,
                          notes: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>
                <div>
                  <button
                    type="submit"
                    disabled={!isLastWeek}
                    className={`inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white ${
                      isLastWeek ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-gray-400 cursor-not-allowed'
                    } focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500`}
                  >
                    Submit Overtime Request
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* Overtime Requests List */}
          {overtimeRequests.length > 0 && (
            <div className="bg-white shadow rounded-lg mb-8">
              <div className="px-4 py-5 sm:p-6">
                <h2 className="text-lg font-medium text-gray-900 mb-4">
                  Your Overtime Requests
                </h2>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                          Date
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                          Hours
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                          Equivalent Days
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                          Notes
                        </th>
                        {session?.user?.role === 'ADMIN' && (
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                            Actions
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {overtimeRequests.map((request) => (
                        <tr key={request.id}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {formatDate(request.request_date)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {request.hours}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {(request.hours / 8).toFixed(2)}
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
                            {request.notes || '-'}
                          </td>
                          {session?.user?.role === 'ADMIN' && (
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                              {request.status === 'PENDING' && (
                                <>
                                  <button
                                    onClick={() =>
                                      handleUpdateOvertimeStatus(request.id, 'APPROVED')
                                    }
                                    className="text-green-600 hover:text-green-900 mr-4 font-medium"
                                  >
                                    Approve
                                  </button>
                                  <button
                                    onClick={() =>
                                      handleUpdateOvertimeStatus(request.id, 'REJECTED')
                                    }
                                    className="text-red-600 hover:text-red-900 font-medium"
                                  >
                                    Reject
                                  </button>
                                </>
                              )}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Requests List */}
          <div className="bg-white shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">
                Your Requests
              </h2>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                        Dates
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                        Type
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                        Reason
                      </th>
                      {session?.user?.role === 'ADMIN' && (
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                          Actions
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {requests.map((request) => (
                      <tr key={request.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {formatDate(request.start_date)} 
                          {' - '} 
                          {formatDate(request.end_date)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {request.type.replace('_', ' ')}
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
                        {session?.user?.role === 'ADMIN' && (
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                            {request.status === 'PENDING' && (
                              <>
                                <button
                                  onClick={() =>
                                    handleUpdateRequestStatus(request.id, 'APPROVED')
                                  }
                                  className="text-green-600 hover:text-green-900 mr-4 font-medium"
                                >
                                  Approve
                                </button>
                                <button
                                  onClick={() =>
                                    handleUpdateRequestStatus(request.id, 'REJECTED')
                                  }
                                  className="text-red-600 hover:text-red-900 font-medium"
                                >
                                  Reject
                                </button>
                              </>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 