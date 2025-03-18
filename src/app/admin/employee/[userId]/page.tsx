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

export default function EmployeeCalendarPage({ params }: { params: { userId: string } }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [requests, setRequests] = useState<TimeOffRequest[]>([]);
  const [balance, setBalance] = useState<TimeOffBalance | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [error, setError] = useState('');
  const [year, setYear] = useState(new Date().getFullYear());

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    } else if (session?.user?.role !== 'ADMIN') {
      router.push('/dashboard');
    } else if (status === 'authenticated') {
      fetchUserData();
      fetchUserRequests();
      fetchUserBalance();
    }
  }, [session, status, params.userId, year]);

  const fetchUserData = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/admin/users/${params.userId}`);
      if (response.ok) {
        const data = await response.json();
        setUser(data);
      } else {
        setError('Failed to fetch user data');
      }
    } catch (err) {
      setError('An error occurred while fetching user data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchUserRequests = async () => {
    try {
      const response = await fetch(`/api/admin/requests/${params.userId}?year=${year}`);
      if (response.ok) {
        const data = await response.json();
        setRequests(data);
      } else {
        setError('Failed to fetch user requests');
      }
    } catch (err) {
      setError('An error occurred while fetching user requests');
      console.error(err);
    }
  };

  const fetchUserBalance = async () => {
    try {
      const response = await fetch(`/api/admin/balance/${params.userId}?year=${year}`);
      if (response.ok) {
        const data = await response.json();
        setBalance(data);
      } else {
        setError('Failed to fetch user balance');
      }
    } catch (err) {
      setError('An error occurred while fetching user balance');
      console.error(err);
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
                  <div className="mt-2">
                    <p><span className="font-medium">Name:</span> {user.name}</p>
                    <p><span className="font-medium">Email:</span> {user.email}</p>
                    <p><span className="font-medium">Role:</span> {user.role}</p>
                  </div>
                </div>
                <div>
                  <h3 className="text-lg font-medium text-gray-900">Time Off Balance ({year})</h3>
                  <div className="mt-2">
                    <p><span className="font-medium">Vacation Days:</span> {balance.vacationDays} days</p>
                    <p><span className="font-medium">Sick Days:</span> {balance.sickDays} days</p>
                    <p><span className="font-medium">Paid Leave:</span> {balance.paidLeave} days</p>
                  </div>
                </div>
                <div>
                  <h3 className="text-lg font-medium text-gray-900">Legend</h3>
                  <div className="mt-2 space-y-2">
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
                  className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300"
                >
                  Previous
                </button>
                <button 
                  onClick={nextMonth}
                  className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300"
                >
                  Next
                </button>
              </div>
            </div>
            
            <div className="grid grid-cols-7 gap-1">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                <div key={day} className="text-center font-medium py-2 bg-gray-50">
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
                      isWeekend(day) ? 'bg-gray-50' : 'bg-white'
                    } ${typeColor}`}
                  >
                    <div className="font-medium">{format(day, 'd')}</div>
                    {dayOff && (
                      <div className="text-xs mt-1">
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
                <thead className="bg-gray-50">
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
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="px-6 py-4 text-center text-sm text-gray-500">
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