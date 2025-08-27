'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface TimeOffBalance {
  id: string;
  userId: string;
  vacationDays: number;
  sickDays: number;
  paidLeave: number;
  year: number;
}

interface OvertimeRequest {
  id: string;
  user_id: string;
  hours: number;
  request_date: string;
  month: number;
  year: number;
  status: string;
  notes?: string;
  user_name?: string;
  user_email?: string;
}

// Add this helper function to safely format dates
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

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [balances, setBalances] = useState<Record<string, TimeOffBalance>>({});
  const [usedDays, setUsedDays] = useState<Record<string, {
    vacationDays: number;
    sickDays: number;
    paidLeave: number;
  }>>({});
  const [pendingOvertimeRequests, setPendingOvertimeRequests] = useState<OvertimeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentYear] = useState(new Date().getFullYear());
  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    password: '',
    role: 'EMPLOYEE',
  });
  const [showAddUser, setShowAddUser] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [highlightedRequestId, setHighlightedRequestId] = useState<string | null>(null);
  const [whoDate, setWhoDate] = useState<string>('');
  const [whoOff, setWhoOff] = useState<Array<{ userId: string; name: string; email: string; type: string; startDate: string; endDate: string }>>([]);
  const [whoLoading, setWhoLoading] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    } else if (session?.user?.role !== 'ADMIN') {
      router.push('/dashboard');
    } else if (status === 'authenticated') {
      fetchUsers();
      fetchPendingOvertimeRequests();
      
      // Check if there's a request ID in the URL
      const url = new URL(window.location.href);
      const requestParam = url.searchParams.get('request');
      if (requestParam) {
        setHighlightedRequestId(requestParam);
        // Scroll to the request section once data is loaded
        setTimeout(() => {
          const requestSection = document.getElementById('overtime-requests-section');
          if (requestSection) {
            requestSection.scrollIntoView({ behavior: 'smooth' });
          }
        }, 1000);
      }
    }
  }, [session, status, router]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/users');
      if (response.ok) {
        const data = await response.json();
        // Handle the new UsersResponse format: { users: User[], total: number }
        const usersArray = data.users || data; // Fallback to old format if needed
        setUsers(usersArray);
        
        // Fetch balances for each user
        const balancesMap: Record<string, TimeOffBalance> = {};
        const usedDaysMap: Record<string, {
          vacationDays: number;
          sickDays: number;
          paidLeave: number;
        }> = {};
        
        for (const user of usersArray) {
          // Fetch balance
          const balanceResponse = await fetch(`/api/admin/balance/${user.id}?year=${currentYear}`);
          if (balanceResponse.ok) {
            const balanceData = await balanceResponse.json();
            balancesMap[user.id] = balanceData;
          }
          
          // Fetch used days
          const usedDaysResponse = await fetch(`/api/admin/used-days/${user.id}?year=${currentYear}`);
          if (usedDaysResponse.ok) {
            const usedDaysData = await usedDaysResponse.json();
            usedDaysMap[user.id] = usedDaysData;
          } else {
            // Default to 0 if we can't fetch used days
            usedDaysMap[user.id] = {
              vacationDays: 0,
              sickDays: 0,
              paidLeave: 0
            };
          }
        }
        
        setBalances(balancesMap);
        setUsedDays(usedDaysMap);
      } else {
        setError('Failed to fetch users');
      }
    } catch (err) {
      setError('An error occurred while fetching data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchWhoIsOff = async () => {
    setWhoLoading(true);
    try {
      const dateParam = whoDate || new Date().toISOString().split('T')[0];
      const res = await fetch(`/api/admin/who-is-off?date=${dateParam}`);
      if (res.ok) {
        const data = await res.json();
        setWhoOff(data);
      } else {
        setWhoOff([]);
      }
    } finally {
      setWhoLoading(false);
    }
  };

  const deleteUser = async (user: User) => {
    if (!confirm(`Delete ${user.name}? This will remove their balances and requests.`)) return;
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to delete user');
        return;
      }
      setUsers(prev => prev.filter(u => u.id !== user.id));
    } catch (e) {
      setError('An error occurred while deleting user');
    } finally {
      setDeletingUserId(null);
    }
  };

  const fetchPendingOvertimeRequests = async () => {
    try {
      const response = await fetch('/api/overtime/requests');
      if (response.ok) {
        const data = await response.json();
        setPendingOvertimeRequests(data);
      }
    } catch (err) {
      setError('An error occurred while fetching overtime requests');
      console.error(err);
    }
  };

  const handleOvertimeRequestAction = async (requestId: string, status: string) => {
    try {
      const response = await fetch(`/api/overtime/requests/${requestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });

      if (response.ok) {
        // Remove the request from the pending list
        setPendingOvertimeRequests(prevRequests => 
          prevRequests.filter(request => request.id !== requestId)
        );
        // Refresh balances as the approval might have changed them
        fetchUsers();
      } else {
        setError('Failed to update overtime request');
      }
    } catch (err) {
      setError('An error occurred while updating overtime request');
      console.error(err);
    }
  };

  const updateBalance = async (userId: string, field: string, value: number) => {
    try {
      const balance = balances[userId];
      if (!balance) return;

      const updatedBalance = { ...balance, [field]: value };
      
      const response = await fetch(`/api/admin/balance/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...updatedBalance,
          year: currentYear
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setBalances(prev => ({
          ...prev,
          [userId]: data
        }));
      } else {
        setError('Failed to update balance');
      }
    } catch (err) {
      setError('An error occurred while updating balance');
      console.error(err);
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser),
      });

      if (response.ok) {
        setNewUser({
          name: '',
          email: '',
          password: '',
          role: 'EMPLOYEE',
        });
        setShowAddUser(false);
        fetchUsers();
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to add user');
      }
    } catch (err) {
      setError('An error occurred while adding user');
      console.error(err);
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
          <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
          <div className="flex space-x-4">
            <button
              onClick={() => router.push('/admin/requests')}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 mr-4"
            >
              View All Time Off Requests
            </button>
            <button
              onClick={() => router.push('/dashboard')}
              className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
            >
              Back to Dashboard
            </button>
            {process.env.NEXT_PUBLIC_ALLOW_DB_RESET === 'true' && (
              <button
                onClick={() => router.push('/admin/reset')}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
              >
                Reset Time Off Data
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        {/* User Management Section */}
        <div className="bg-white shadow overflow-hidden sm:rounded-lg mb-8">
          <div className="px-4 py-5 sm:px-6 flex justify-between items-center">
            <div>
              <h2 className="text-lg font-medium text-gray-900">
                User Management
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Add and manage employees
              </p>
            </div>
            <button
              onClick={() => setShowAddUser(!showAddUser)}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            >
              {showAddUser ? 'Cancel' : 'Add Employee'}
            </button>
          </div>

          {showAddUser && (
            <div className="px-4 py-5 sm:px-6 border-t border-gray-200">
              <form onSubmit={handleAddUser} className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                      Name
                    </label>
                    <input
                      type="text"
                      id="name"
                      required
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                      value={newUser.name}
                      onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                    />
                  </div>
                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                      Email
                    </label>
                    <input
                      type="email"
                      id="email"
                      required
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                      value={newUser.email}
                      onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                    />
                  </div>
                  <div>
                    <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                      Password
                    </label>
                    <input
                      type="password"
                      id="password"
                      required
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                      value={newUser.password}
                      onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                    />
                  </div>
                  <div>
                    <label htmlFor="role" className="block text-sm font-medium text-gray-700">
                      Role
                    </label>
                    <select
                      id="role"
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                      value={newUser.role}
                      onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                    >
                      <option value="EMPLOYEE">Employee</option>
                      <option value="ADMIN">Admin</option>
                    </select>
                  </div>
                </div>
                <div>
                  <button
                    type="submit"
                    className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                  >
                    Add Employee
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>

        {/* Who is off */}
        <div className="bg-white shadow overflow-hidden sm:rounded-lg mb-8">
          <div className="px-4 py-5 sm:px-6">
            <h2 className="text-lg font-medium text-gray-900">Who is off</h2>
            <p className="mt-1 text-sm text-gray-500">Check who is taking time off on a specific day.</p>
            <div className="mt-4 flex items-center space-x-2">
              <input
                type="date"
                value={whoDate}
                onChange={(e) => setWhoDate(e.target.value)}
                className="border border-gray-300 rounded-md p-2"
              />
              <button
                onClick={fetchWhoIsOff}
                className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
                disabled={whoLoading}
              >
                {whoLoading ? 'Checking…' : 'Check'}
              </button>
            </div>
            <div className="mt-4">
              {whoOff.length === 0 ? (
                <div className="text-sm text-gray-700">No one is taking time off</div>
              ) : (
                <ul className="list-disc list-inside text-sm text-gray-800">
                  {whoOff.map(item => (
                    <li key={`${item.userId}-${item.startDate}`}>{item.name} — {item.type.replace('_',' ')} ({new Date(item.startDate).toLocaleDateString()} - {new Date(item.endDate).toLocaleDateString()})</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        {/* Pending Overtime Requests Section */}
        {pendingOvertimeRequests.length > 0 && (
          <div id="overtime-requests-section" className="bg-white shadow overflow-hidden sm:rounded-lg mb-8">
            <div className="px-4 py-5 sm:px-6">
              <h2 className="text-lg font-medium text-gray-900">
                Pending Overtime Requests
                {highlightedRequestId && (
                  <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                    New request highlighted
                  </span>
                )}
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Approve or reject employee overtime compensation requests
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                      Employee
                    </th>
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
                      Notes
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {pendingOvertimeRequests.map((request) => (
                    <tr 
                      key={request.id} 
                      className={highlightedRequestId === request.id ? 'bg-yellow-50' : ''}
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{request.user_name}</div>
                        <div className="text-sm text-gray-700">{request.user_email}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {formatDate(request.request_date)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {request.hours}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {(request.hours / 8).toFixed(2)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                        {request.notes || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <button
                          onClick={() => handleOvertimeRequestAction(request.id, 'APPROVED')}
                          className="text-green-600 hover:text-green-900 mr-4 font-medium"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleOvertimeRequestAction(request.id, 'REJECTED')}
                          className="text-red-600 hover:text-red-900 font-medium"
                        >
                          Reject
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Time Off Balances Section */}
        <div className="bg-white shadow overflow-hidden sm:rounded-lg mb-8">
          <div className="px-4 py-5 sm:px-6">
            <h2 className="text-lg font-medium text-gray-900">
              Employee Time Off Balances - {currentYear}
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Manage vacation, sick days, and paid leave for each employee
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Vacation Days
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Sick Days
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Paid Leave
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {users.map((user) => {
                  const balance = balances[user.id];
                  const used = usedDays[user.id] || { vacationDays: 0, sickDays: 0, paidLeave: 0 };
                  
                  // Calculate total allocated (current balance + used days)
                  const totalVacation = (balance?.vacationDays || 0) + used.vacationDays;
                  const totalSick = (balance?.sickDays || 0) + used.sickDays;
                  const totalPaidLeave = (balance?.paidLeave || 0) + used.paidLeave;
                  
                  return (
                    <tr key={user.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <button
                          onClick={() => router.push(`/admin/employee/${user.id}`)}
                          className="text-indigo-600 hover:text-indigo-900"
                          title="View employee details"
                        >
                          {user.name}
                        </button>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {user.email}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <div>
                          <span className="font-medium">{used.vacationDays}</span>
                          <span className="text-gray-500 text-xs ml-1"> of {totalVacation}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <div>
                          <span className="font-medium">{used.sickDays}</span>
                          <span className="text-gray-500 text-xs ml-1"> of {totalSick}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <div>
                          <span className="font-medium">{used.paidLeave}</span>
                          <span className="text-gray-500 text-xs ml-1"> of {totalPaidLeave}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <button
                          onClick={() => router.push(`/admin/employee/${user.id}`)}
                          className="text-indigo-600 hover:text-indigo-900 mr-4"
                        >
                          View Details
                        </button>
                        <button
                          onClick={() => {
                            setDeletingUserId(user.id);
                            deleteUser(user);
                          }}
                          disabled={deletingUserId === user.id}
                          className={deletingUserId === user.id ? 'text-gray-400 cursor-not-allowed' : 'text-red-600 hover:text-red-900'}
                        >
                          {deletingUserId === user.id ? 'Deleting…' : 'Delete'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
} 