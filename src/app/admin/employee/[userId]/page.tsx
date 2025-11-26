'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isWeekend, isSameDay, addMonths, subMonths } from 'date-fns';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface TimeOffRequest {
  id: string;
  user_id: string;
  start_date: string;
  end_date: string;
  type: 'VACATION' | 'SICK' | 'PAID_LEAVE';
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reason?: string;
}

interface TimeOffBalance {
  id: string;
  userId: string;
  vacationDays: number;
  sickDays: number;
  paidLeave: number;
  personalDays: number;
  year: number;
}

interface UsedDays {
  vacationDays: number;
  sickDays: number;
  paidLeave: number;
  personalDays: number;
}

interface OvertimeRequest {
  id: string;
  hours: number;
  request_date: string;
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

type PageProps = {
  params: {
    userId: string;
  };
};

export default function EmployeePage({ params }: PageProps) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { userId } = params;
  const [year, setYear] = useState(new Date().getFullYear());
  const [user, setUser] = useState<User | null>(null);
  const [balance, setBalance] = useState<TimeOffBalance | null>(null);
  const [usedDays, setUsedDays] = useState<UsedDays | null>(null);
  const [requests, setRequests] = useState<TimeOffRequest[]>([]);
  const [overtimeRequests, setOvertimeRequests] = useState<OvertimeRequest[]>([]);
  const [auditLogs, setAuditLogs] = useState<Array<{ id: string; action: string; entityType: string; entityId: string; details: any; createdAt: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [editedBalance, setEditedBalance] = useState<TimeOffBalance | null>(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    } else if (session?.user?.role !== 'ADMIN') {
      router.push('/dashboard');
    } else {
      fetchUserData();
    }
  }, [userId, year, session, status]);

  const fetchUserData = async () => {
    try {
      setLoading(true);
      setError('');
      
      // Fetch user details
      const userResponse = await fetch(`/api/admin/users/${userId}`);
      if (!userResponse.ok) {
        throw new Error('Failed to fetch user data');
      }
      const userData = await userResponse.json();
      setUser(userData);
      
      // Fetch time off balance
      const balanceResponse = await fetch(`/api/admin/balance/${userId}?year=${year}`);
      if (balanceResponse.ok) {
        const balanceData = await balanceResponse.json();
        setBalance(balanceData);
        
        // Initialize edited balance with current values
        setEditedBalance(balanceData);
      }
      
      // Fetch used days
      const usedDaysResponse = await fetch(`/api/admin/used-days/${userId}?year=${year}`);
      if (usedDaysResponse.ok) {
        const usedDaysData = await usedDaysResponse.json();
        setUsedDays(usedDaysData);
      }
      
      // Fetch time off requests
      const requestsResponse = await fetch(`/api/admin/requests?userId=${userId}&year=${year}`);
      if (requestsResponse.ok) {
        const requestsData = await requestsResponse.json();
        setRequests(requestsData);
      }

      // Fetch overtime requests (user perspective)
      const overtimeRes = await fetch('/api/overtime/requests');
      if (overtimeRes.ok) {
        const overtimeData = await overtimeRes.json();
        const mine = Array.isArray(overtimeData) ? overtimeData.filter((r: any) => r.user_id === userId || r.userId === userId) : [];
        setOvertimeRequests(mine);
      }

      // Fetch recent audit logs
      const auditRes = await fetch(`/api/admin/audit?userId=${userId}&limit=10`);
      if (auditRes.ok) {
        const logs = await auditRes.json();
        setAuditLogs(logs);
      }
    } catch (err) {
      setError('An error occurred while fetching data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const saveBalance = async () => {
    if (!editedBalance || !userId) return;
    
    try {
      setLoading(true);
      setError('');
      setSuccess('');
      
      const response = await fetch(`/api/admin/balance/${userId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...editedBalance,
          year
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update balance');
      }
      
      // Get the updated balance
      const updatedBalance = await response.json();
      setBalance(updatedBalance);
      setSuccess('Balance updated successfully');
      setEditMode(false);
      
      // Refresh data to get updated values
      fetchUserData();
    } catch (err: any) {
      setError(err.message || 'An error occurred while updating balance');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const nextMonth = () => {
    setCurrentMonth(addMonths(currentMonth, 1));
    if (currentMonth.getMonth() === 11 && addMonths(currentMonth, 1).getMonth() === 0) {
      setYear(year + 1);
    }
  };

  const prevMonth = () => {
    setCurrentMonth(subMonths(currentMonth, 1));
    if (currentMonth.getMonth() === 0 && subMonths(currentMonth, 1).getMonth() === 11) {
      setYear(year - 1);
    }
  };

  const getDaysInMonth = () => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    return eachDayOfInterval({ start: monthStart, end: monthEnd });
  };

  const isDayOff = (date: Date) => {
    for (const request of requests) {
      if (request.status === 'APPROVED') {
        const startDate = new Date(request.start_date);
        const endDate = new Date(request.end_date);
        
        // Check if the date is between start and end dates (inclusive)
        if (date >= startDate && date <= endDate) {
          return request.type;
        }
      }
    }
    return null;
  };

  const getTypeColor = (type: string | null) => {
    if (!type) return '';
    switch(type) {
      case 'VACATION':
        return 'bg-blue-100 border-blue-300 text-blue-800';
      case 'SICK':
        return 'bg-red-100 border-red-300 text-red-800';
      case 'PAID_LEAVE':
        return 'bg-green-100 border-green-300 text-green-800';
      default:
        return '';
    }
  };

  const handleDeleteTimeOff = async (requestId: string) => {
    try {
      const response = await fetch(`/api/time-off/requests/${requestId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        // Refresh the requests and balance
        fetchUserData();
      } else {
        const error = await response.json();
        console.error('Error deleting time off:', error);
      }
    } catch (error) {
      console.error('Error deleting time off:', error);
    }
  };

  if (status === 'loading' || loading) {
    return <div className="flex justify-center items-center h-screen">Loading...</div>;
  }

  if (session?.user?.role !== 'ADMIN') {
    return null;
  }

  const days = getDaysInMonth();

  return (
    <div className="min-h-screen bg-gray-100 py-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            {user?.name}'s Calendar
          </h1>
          <div className="flex space-x-4">
            <button
              onClick={() => router.push('/admin')}
              className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
            >
              Back to Admin
            </button>
          </div>
        </div>

        {/* Time Off Balance Section */}
        <div className="bg-white shadow rounded-lg mb-8">
          <div className="px-4 py-5 sm:p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-medium text-gray-900">Time Off Balance</h2>
              {!editMode ? (
                <button
                  onClick={() => setEditMode(true)}
                  className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
                >
                  Edit Balance
                </button>
              ) : (
                <div className="flex space-x-2">
                  <button
                    onClick={saveBalance}
                    className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                  >
                    Save Changes
                  </button>
                  <button
                    onClick={() => {
                      setEditMode(false);
                      setEditedBalance(balance);
                    }}
                    className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>

            {error && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
                {error}
              </div>
            )}

            {success && (
              <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
                {success}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Vacation Days */}
              <div className="bg-blue-50 border-l-4 border-blue-400 p-4 rounded">
                <h3 className="text-sm font-medium text-blue-800">Vacation Days</h3>
                {editMode ? (
                  <input
                    type="number"
                    value={editedBalance?.vacationDays || 0}
                    onChange={(e) => setEditedBalance(prev => prev ? {...prev, vacationDays: parseInt(e.target.value)} : null)}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                    min="0"
                  />
                ) : (
                  <p className="mt-1 text-2xl font-semibold text-blue-900">
                    {balance?.vacationDays || 0}
                    {usedDays && <span className="text-sm text-blue-600 ml-2">(Used: {usedDays.vacationDays})</span>}
                  </p>
                )}
              </div>

              {/* Sick Days */}
              <div className="bg-red-50 border-l-4 border-red-400 p-4 rounded">
                <h3 className="text-sm font-medium text-red-800">Sick Days</h3>
                {editMode ? (
                  <input
                    type="number"
                    value={editedBalance?.sickDays || 0}
                    onChange={(e) => setEditedBalance(prev => prev ? {...prev, sickDays: parseInt(e.target.value)} : null)}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-red-500 focus:ring-red-500 sm:text-sm"
                    min="0"
                  />
                ) : (
                  <p className="mt-1 text-2xl font-semibold text-red-900">
                    {balance?.sickDays || 0}
                    {usedDays && <span className="text-sm text-red-600 ml-2">(Used: {usedDays.sickDays})</span>}
                  </p>
                )}
              </div>

              {/* Paid Leave */}
              <div className="bg-green-50 border-l-4 border-green-400 p-4 rounded">
                <h3 className="text-sm font-medium text-green-800">Paid Leave</h3>
                {editMode ? (
                  <input
                    type="number"
                    value={editedBalance?.paidLeave || 0}
                    onChange={(e) => setEditedBalance(prev => prev ? {...prev, paidLeave: parseInt(e.target.value)} : null)}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500 sm:text-sm"
                    min="0"
                  />
                ) : (
                  <p className="mt-1 text-2xl font-semibold text-green-900">
                    {balance?.paidLeave || 0}
                    {usedDays && <span className="text-sm text-green-600 ml-2">(Used: {usedDays.paidLeave})</span>}
                  </p>
                )}
              </div>

              {/* Personal Days */}
              <div className="bg-purple-50 border-l-4 border-purple-400 p-4 rounded">
                <h3 className="text-sm font-medium text-purple-800">Personal Days</h3>
                {editMode ? (
                  <input
                    type="number"
                    value={editedBalance?.personalDays || 0}
                    onChange={(e) => setEditedBalance(prev => prev ? {...prev, personalDays: parseInt(e.target.value)} : null)}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-purple-500 focus:ring-purple-500 sm:text-sm"
                    min="0"
                  />
                ) : (
                  <p className="mt-1 text-2xl font-semibold text-purple-900">
                    {balance?.personalDays || 0}
                    {usedDays && <span className="text-sm text-purple-600 ml-2">(Used: {usedDays.personalDays})</span>}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Calendar */}
        <div className="bg-white shadow overflow-hidden sm:rounded-lg mb-8">
          <div className="px-4 py-5 sm:p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-medium text-gray-900">
                Calendar - {format(currentMonth, 'MMMM yyyy')}
              </h2>
              <div className="flex space-x-2">
                <button 
                  onClick={prevMonth}
                  className="px-3 py-1 bg-gray-300 rounded hover:bg-gray-400 text-gray-800"
                >
                  Previous
                </button>
                <button 
                  onClick={nextMonth}
                  className="px-3 py-1 bg-gray-300 rounded hover:bg-gray-400 text-gray-800"
                >
                  Next
                </button>
              </div>
            </div>
            
            <div className="grid grid-cols-7 gap-1">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                <div key={day} className="text-center font-medium py-2 bg-gray-200 text-gray-800">
                  {day}
                </div>
              ))}
              
              {Array(days[0].getDay())
                .fill(null)
                .map((_, index) => (
                  <div key={`empty-${index}`} className="py-8"></div>
                ))}
              
              {days.map((day) => {
                const dayOff = isDayOff(day);
                const typeColor = getTypeColor(dayOff);
                const request = requests.find(req => {
                  const startDate = new Date(req.start_date);
                  const endDate = new Date(req.end_date);
                  return day >= startDate && day <= endDate && req.status === 'APPROVED';
                });
                
                return (
                  <div 
                    key={day.toString()} 
                    className={`border p-2 min-h-[80px] ${
                      isWeekend(day) ? 'bg-gray-200' : 'bg-white'
                    } ${typeColor}`}
                  >
                    <div className="font-medium text-gray-800">{format(day, 'd')}</div>
                    {dayOff && (
                      <div className="text-xs mt-1 font-medium">
                        {dayOff.replace('_', ' ')}
                        {session?.user?.role === 'ADMIN' && request && (
                          <button
                            onClick={() => handleDeleteTimeOff(request.id)}
                            className="ml-2 text-red-600 hover:text-red-800"
                            title="Delete this time off"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Time Off Requests */}
        <div className="bg-white shadow overflow-hidden sm:rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">
              Time Off Requests
            </h2>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-200">
                  <tr>
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
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {requests.length > 0 ? (
                    requests.map((request) => (
                      <tr key={request.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-800">
                          {request.type.replace('_', ' ')}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800">
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
                        <td className="px-6 py-4 text-sm text-gray-800 max-w-xs truncate" title={request.reason}>
                          {request.reason || '-'}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="px-6 py-4 text-center text-sm text-gray-700 font-medium">
                        No time off requests found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Overtime Requests */}
        <div className="bg-white shadow overflow-hidden sm:rounded-lg mt-8">
          <div className="px-4 py-5 sm:p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Overtime Requests</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Date</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Hours</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Equivalent Days</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Notes</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {overtimeRequests.length > 0 ? (
                    overtimeRequests.map((r) => (
                      <tr key={r.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800">{formatDate(r.request_date)}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800">{r.hours}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800">{(r.hours / 8).toFixed(2)}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            r.status === 'APPROVED' ? 'bg-green-100 text-green-800' : r.status === 'REJECTED' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {r.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800">{r.notes || '-'}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="px-6 py-4 text-center text-sm text-gray-700 font-medium">No overtime requests found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-white shadow overflow-hidden sm:rounded-lg mt-8">
          <div className="px-4 py-5 sm:p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Recent Activity</h2>
            {auditLogs.length === 0 ? (
              <div className="text-sm text-gray-700">No recent activity.</div>
            ) : (
              <ul className="space-y-2">
                {auditLogs.map(log => (
                  <li key={log.id} className="text-sm text-gray-800">
                    <span className="font-medium">{new Date(log.createdAt).toLocaleString()}</span> — {log.action} {log.entityType}
                    {log.details && (
                      <span className="text-gray-600">: {typeof log.details === 'string' ? log.details : JSON.stringify(log.details)}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
} 