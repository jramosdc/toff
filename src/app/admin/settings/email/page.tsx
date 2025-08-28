'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export default function EmailSettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [userEmail, setUserEmail] = useState('');
  const [userPass, setUserPass] = useState('');
  const [hasPassword, setHasPassword] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
    if (session?.user?.role !== 'ADMIN') router.push('/dashboard');
    if (status === 'authenticated') {
      (async () => {
        const res = await fetch('/api/admin/email-settings');
        if (res.ok) {
          const data = await res.json();
          setUserEmail(data.userEmail || '');
          setHasPassword(!!data.hasPassword);
        }
        setLoading(false);
      })();
    }
  }, [session, status]);

  const save = async () => {
    setToast(null);
    const res = await fetch('/api/admin/email-settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userEmail, userPass: userPass || undefined }),
    });
    if (res.ok) {
      setToast({ type: 'success', message: 'Settings saved' });
      setHasPassword(!!userPass || hasPassword);
      setUserPass('');
    } else {
      const data = await res.json();
      setToast({ type: 'error', message: data.error || 'Failed to save settings' });
    }
    setTimeout(() => setToast(null), 2500);
  };

  const sendTest = async () => {
    setToast(null);
    const res = await fetch('/api/admin/email-settings/test', { method: 'POST' });
    if (res.ok) {
      setToast({ type: 'success', message: 'Test email sent' });
    } else {
      const data = await res.json();
      setToast({ type: 'error', message: data.error || 'Failed to send test email' });
    }
    setTimeout(() => setToast(null), 2500);
  };

  if (status === 'loading' || loading) return <div className="p-6">Loading…</div>;

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Email Settings</h1>
      <p className="text-sm text-gray-600 mb-6">SMTP host/port/secure are read from server env. Configure the sender email and password here.</p>
      {toast && (
        <div className={`mb-4 px-4 py-2 rounded ${toast.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{toast.message}</div>
      )}
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Sender Email</label>
          <input
            type="email"
            className="mt-1 block w-full border border-gray-300 rounded-md p-2"
            value={userEmail}
            onChange={(e) => setUserEmail(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Password {hasPassword && <span className="text-xs text-gray-500">(saved)</span>}</label>
          <input
            type="password"
            className="mt-1 block w-full border border-gray-300 rounded-md p-2"
            value={userPass}
            onChange={(e) => setUserPass(e.target.value)}
            placeholder={hasPassword ? '••••••••' : ''}
          />
        </div>
        <div className="flex space-x-2">
          <button onClick={save} className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700">Save</button>
          <button onClick={sendTest} className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700">Send Test Email</button>
        </div>
      </div>
    </div>
  );
}


