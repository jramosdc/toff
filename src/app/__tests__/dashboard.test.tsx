import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import DashboardPage from '../dashboard/page';

// Mock the date formatting functions
vi.mock('@/lib/date-utils', () => ({
  calculateWorkingDays: vi.fn(() => 5),
}));

// Mock next-auth
vi.mock('next-auth/react', () => ({
  useSession: vi.fn(() => ({
    data: {
      user: {
        id: 'test-user-id',
        email: 'test@example.com',
        name: 'Test User',
        role: 'EMPLOYEE'
      }
    },
    status: 'authenticated'
  })),
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

// Mock fetch for API calls
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock successful API responses
    mockFetch.mockImplementation((url) => {
      if (url.includes('/api/time-off/balance')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            vacationDays: 15,
            sickDays: 7,
            paidLeave: 3,
            personalDays: 3,
          }),
        });
      }
      
      if (url.includes('/api/time-off/requests')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            {
              id: 'request-1',
              user_id: 'user-1',
              start_date: '2025-01-20T00:00:00.000Z',
              end_date: '2025-01-24T00:00:00.000Z',
              type: 'VACATION',
              status: 'PENDING',
              reason: 'Annual vacation',
            },
          ]),
        });
      }
      
      if (url.includes('/api/overtime/requests')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            {
              id: 'overtime-1',
              hours: 8,
              request_date: '2025-01-20',
              month: 1,
              year: 2025,
              status: 'PENDING',
              notes: 'Extra work',
            },
          ]),
        });
      }
      
      if (url.includes('/api/time-off/used-days')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            vacationDays: 5,
            sickDays: 2,
            paidLeave: 1,
            personalDays: 0,
          }),
        });
      }
      
      return Promise.resolve({
        ok: false,
        json: () => Promise.resolve({ error: 'Not found' }),
      });
    });
  });

  describe('Rendering', () => {
    it('should render the dashboard title', () => {
      render(<DashboardPage />);
      expect(screen.getByText('Time Off Dashboard')).toBeInTheDocument();
    });

    it('should render balance summary section', async () => {
      render(<DashboardPage />);
      
      await waitFor(() => {
        expect(screen.getByText('Time Off Balance Summary')).toBeInTheDocument();
        expect(screen.getByText('Vacation Days')).toBeInTheDocument();
        expect(screen.getByText('Sick Days')).toBeInTheDocument();
        expect(screen.getByText('Paid Leave')).toBeInTheDocument();
        expect(screen.getByText('Personal Time Off')).toBeInTheDocument();
      });
    });

    it('should render time off request form', () => {
      render(<DashboardPage />);
      expect(screen.getByText('Request Time Off')).toBeInTheDocument();
      expect(screen.getByLabelText('Start Date')).toBeInTheDocument();
      expect(screen.getByLabelText('End Date')).toBeInTheDocument();
      expect(screen.getByLabelText('Type')).toBeInTheDocument();
      expect(screen.getByLabelText('Reason')).toBeInTheDocument();
    });

    it('should render overtime request form', () => {
      render(<DashboardPage />);
      expect(screen.getByText('Request Overtime Compensation')).toBeInTheDocument();
      expect(screen.getByLabelText('Hours Worked')).toBeInTheDocument();
      expect(screen.getByLabelText('Notes')).toBeInTheDocument();
    });

    it('should render requests list section', async () => {
      render(<DashboardPage />);
      
      await waitFor(() => {
        expect(screen.getByText('Your Requests')).toBeInTheDocument();
      });
    });

    it('should render overtime requests list section', async () => {
      render(<DashboardPage />);
      
      await waitFor(() => {
        expect(screen.getByText('Your Overtime Requests')).toBeInTheDocument();
      });
    });
  });

  describe('Balance Display', () => {
    it('should display correct balance information', async () => {
      render(<DashboardPage />);
      
      await waitFor(() => {
        expect(screen.getByText('15')).toBeInTheDocument(); // Vacation days
        expect(screen.getByText('7')).toBeInTheDocument();  // Sick days
        expect(screen.getByText('3')).toBeInTheDocument();  // Paid leave
        expect(screen.getByText('3')).toBeInTheDocument();  // Personal days
      });
    });

    it('should display used days information', async () => {
      render(<DashboardPage />);
      
      await waitFor(() => {
        expect(screen.getByText('5 days used')).toBeInTheDocument(); // Vacation used
        expect(screen.getByText('2 days used')).toBeInTheDocument(); // Sick used
        expect(screen.getByText('1 days used')).toBeInTheDocument(); // Paid leave used
        expect(screen.getByText('No days used')).toBeInTheDocument(); // Personal used
      });
    });
  });

  describe('Time Off Request Form', () => {
    it('should allow users to fill out the form', async () => {
      render(<DashboardPage />);
      
      const startDateInput = screen.getByLabelText('Start Date');
      const endDateInput = screen.getByLabelText('End Date');
      const typeSelect = screen.getByLabelText('Type');
      const reasonInput = screen.getByLabelText('Reason');
      
      fireEvent.change(startDateInput, { target: { value: '2025-02-01' } });
      fireEvent.change(endDateInput, { target: { value: '2025-02-05' } });
      fireEvent.change(typeSelect, { target: { value: 'VACATION' } });
      fireEvent.change(reasonInput, { target: { value: 'Family vacation' } });
      
      expect(startDateInput).toHaveValue('2025-02-01');
      expect(endDateInput).toHaveValue('2025-02-05');
      expect(typeSelect).toHaveValue('VACATION');
      expect(reasonInput).toHaveValue('Family vacation');
    });

    it('should submit time off request successfully', async () => {
      mockFetch.mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, id: 'new-request-1' }),
        })
      );

      render(<DashboardPage />);
      
      const startDateInput = screen.getByLabelText('Start Date');
      const endDateInput = screen.getByLabelText('End Date');
      const submitButton = screen.getByText('Submit Request');
      
      fireEvent.change(startDateInput, { target: { value: '2025-02-01' } });
      fireEvent.change(endDateInput, { target: { value: '2025-02-05' } });
      
      fireEvent.click(submitButton);
      
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith('/api/time-off/requests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: 'test-user-id',
            startDate: '2025-02-01',
            endDate: '2025-02-05',
            type: 'VACATION',
            reason: '',
          }),
        });
      });
    });
  });

  describe('Overtime Request Form', () => {
    it('should allow users to fill out overtime form', () => {
      render(<DashboardPage />);
      
      const hoursInput = screen.getByLabelText('Hours Worked');
      const notesInput = screen.getByLabelText('Notes');
      
      fireEvent.change(hoursInput, { target: { value: '16' } });
      fireEvent.change(notesInput, { target: { value: 'Weekend project work' } });
      
      expect(hoursInput).toHaveValue(16);
      expect(notesInput).toHaveValue('Weekend project work');
    });

    it('should show warning when not in last week of month', () => {
      render(<DashboardPage />);
      
      expect(screen.getByText('Overtime requests can only be submitted during the last week of the month.')).toBeInTheDocument();
    });
  });

  describe('Requests Display', () => {
    it('should display time off requests correctly', async () => {
      render(<DashboardPage />);
      
      await waitFor(() => {
        expect(screen.getByText('Annual vacation')).toBeInTheDocument();
        expect(screen.getByText('VACATION')).toBeInTheDocument();
        expect(screen.getByText('PENDING')).toBeInTheDocument();
      });
    });

    it('should display overtime requests correctly', async () => {
      render(<DashboardPage />);
      
      await waitFor(() => {
        expect(screen.getByText('8')).toBeInTheDocument(); // Hours
        expect(screen.getByText('1.00')).toBeInTheDocument(); // Equivalent days
        expect(screen.getByText('PENDING')).toBeInTheDocument();
        expect(screen.getByText('Extra work')).toBeInTheDocument(); // Notes
      });
    });
  });

  describe('Admin Features', () => {
    it('should show admin panel button for admin users', async () => {
      // Mock admin user session
      const { useSession } = require('next-auth/react');
      vi.mocked(useSession).mockReturnValue({
        data: {
          user: {
            id: 'admin-1',
            email: 'admin@example.com',
            name: 'Admin User',
            role: 'ADMIN'
          }
        },
        status: 'authenticated'
      });

      render(<DashboardPage />);
      
      await waitFor(() => {
        expect(screen.getByText('Admin Panel')).toBeInTheDocument();
      });
    });

    it('should show approve/reject buttons for pending requests when admin', async () => {
      // Mock admin user session
      const { useSession } = require('next-auth/react');
      vi.mocked(useSession).mockReturnValue({
        data: {
          user: {
            id: 'admin-1',
            email: 'admin@example.com',
            name: 'Admin User',
            role: 'ADMIN'
          }
        },
        status: 'authenticated'
      });

      render(<DashboardPage />);
      
      await waitFor(() => {
        expect(screen.getByText('Approve')).toBeInTheDocument();
        expect(screen.getByText('Reject')).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle API errors gracefully', async () => {
      mockFetch.mockImplementationOnce(() =>
        Promise.resolve({
          ok: false,
          json: () => Promise.resolve({ error: 'Server error' }),
        })
      );

      render(<DashboardPage />);
      
      const startDateInput = screen.getByLabelText('Start Date');
      const endDateInput = screen.getByLabelText('End Date');
      const submitButton = screen.getByText('Submit Request');
      
      fireEvent.change(startDateInput, { target: { value: '2025-02-01' } });
      fireEvent.change(endDateInput, { target: { value: '2025-02-05' } });
      
      fireEvent.click(submitButton);
      
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });
    });
  });

  describe('Date Validation', () => {
    it('should handle invalid dates gracefully', async () => {
      // Mock API response with invalid dates
      mockFetch.mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            {
              id: 'request-1',
              user_id: 'user-1',
              start_date: 'invalid-date',
              end_date: 'also-invalid',
              type: 'VACATION',
              status: 'PENDING',
              reason: 'Test',
            },
          ]),
        })
      );

      render(<DashboardPage />);
      
      await waitFor(() => {
        expect(screen.getByText('Your Requests')).toBeInTheDocument();
      });
    });
  });
});
