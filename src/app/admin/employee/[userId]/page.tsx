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
  year: number;
}

interface UsedDays {
  vacationDays: number;
  sickDays: number;
  paidLeave: number;
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [editedBalance, setEditedBalance] = useState<{
    vacationDays: number;
    sickDays: number;
    paidLeave: number;
  } | null>(null);
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
        setEditedBalance({
          vacationDays: balanceData.vacationDays,
          sickDays: balanceData.sickDays,
          paidLeave: balanceData.paidLeave,
        });
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

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        {/* Employee Info Card */}
        {user && balance && (
          <div className="bg-white shadow sm:rounded-lg mb-8">
            <div className="px-4 py-5 sm:p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <h3 className="text-lg font-medium text-gray-900">Employee Details</h3>
                  <div className="mt-2 text-gray-800">
                    <p><span className="font-medium">Name:</span> {user.name}</p>
                    <p><span className="font-medium">Email:</span> {user.email}</p>
                    <p><span className="font-medium">Role:</span> {user.role}</p>
                  </div>
                </div>
                <div>
                  <h3 className="text-lg font-medium text-gray-900">Time Off Balance ({year})</h3>
                  <div className="mt-2 text-gray-800">
                    {!editMode ? (
                      <>
                        <div className="mb-2">
                          <span className="font-medium">Vacation Days:</span> 
                          <span className="ml-2">{balance?.vacationDays || 0}</span>
                          <span className="text-gray-500 text-sm ml-1">
                            / {(balance?.vacationDays || 0) + (usedDays?.vacationDays || 0)} 
                            {usedDays?.vacationDays ? ` (${usedDays.vacationDays} used)` : ''}
                          </span>
                        </div>
                        <div className="mb-2">
                          <span className="font-medium">Sick Days:</span> 
                          <span className="ml-2">{balance?.sickDays || 0}</span>
                          <span className="text-gray-500 text-sm ml-1">
                            / {(balance?.sickDays || 0) + (usedDays?.sickDays || 0)}
                            {usedDays?.sickDays ? ` (${usedDays.sickDays} used)` : ''}
                          </span>
                        </div>
                        <div className="mb-2">
                          <span className="font-medium">Paid Leave:</span> 
                          <span className="ml-2">{balance?.paidLeave || 0}</span>
                          <span className="text-gray-500 text-sm ml-1">
                            / {(balance?.paidLeave || 0) + (usedDays?.paidLeave || 0)}
                            {usedDays?.paidLeave ? ` (${usedDays.paidLeave} used)` : ''}
                          </span>
                        </div>
                        <button
                          onClick={() => setEditMode(true)}
                          className="mt-2 text-indigo-600 text-sm hover:text-indigo-800"
                        >
                          Edit Balance
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="grid grid-cols-3 gap-4 mb-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700">Vacation Days</label>
                            <input
                              type="number"
                              min="0"
                              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                              value={editedBalance?.vacationDays || 0}
                              onChange={(e) => setEditedBalance({
                                ...editedBalance!,
                                vacationDays: parseInt(e.target.value) || 0
                              })}
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700">Sick Days</label>
                            <input
                              type="number"
                              min="0"
                              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                              value={editedBalance?.sickDays || 0}
                              onChange={(e) => setEditedBalance({
                                ...editedBalance!,
                                sickDays: parseInt(e.target.value) || 0
                              })}
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700">Paid Leave</label>
                            <input
                              type="number"
                              min="0"
                              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                              value={editedBalance?.paidLeave || 0}
                              onChange={(e) => setEditedBalance({
                                ...editedBalance!,
                                paidLeave: parseInt(e.target.value) || 0
                              })}
                            />
                          </div>
                        </div>
                        <div className="flex space-x-2">
                          <button
                            onClick={saveBalance}
                            className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm hover:bg-indigo-700"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditMode(false)}
                            className="border border-gray-300 text-gray-700 px-4 py-2 rounded-md text-sm hover:bg-gray-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
                <div>
                  <h3 className="text-lg font-medium text-gray-900">Legend</h3>
                  <div className="mt-2 space-y-2 text-gray-800">
                    <div className="flex items-center">
                      <div className="w-4 h-4 bg-blue-100 border border-blue-300 rounded mr-2"></div>
                      <span>Vacation</span>
                    </div>
                    <div className="flex items-center">
                      <div className="w-4 h-4 bg-red-100 border border-red-300 rounded mr-2"></div>
                      <span>Sick Leave</span>
                    </div>
                    <div className="flex items-center">
                      <div className="w-4 h-4 bg-green-100 border border-green-300 rounded mr-2"></div>
                      <span>Paid Leave</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

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
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800">
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
      </div>
    </div>
  );
} 