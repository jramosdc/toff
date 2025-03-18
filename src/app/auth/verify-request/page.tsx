import React from 'react';
import Link from 'next/link';

export default function VerifyRequest() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="w-full max-w-md bg-white p-8 rounded-lg shadow-md">
        <h1 className="text-2xl font-bold mb-4 text-center">Check your email</h1>
        <p className="text-gray-600 mb-6 text-center">
          A sign in link has been sent to your email address. Please check your inbox.
        </p>
        <div className="border-t pt-4">
          <p className="text-sm text-gray-500 mb-2">
            If you don&apos;t see the email, check other places it might be, like your spam, junk, social, or other folders.
          </p>
          <div className="flex justify-center mt-4">
            <Link href="/login" className="text-blue-600 hover:text-blue-800 text-sm">
              Back to Sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
} 