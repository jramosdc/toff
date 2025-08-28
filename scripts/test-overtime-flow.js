#!/usr/bin/env node
/*
  Quick e2e script for overtime flow against a running environment.
  Requirements:
  - BASE_URL: full URL (e.g., https://toff-xyz.vercel.app)
  - AUTH_COOKIE: session cookie string for an authenticated ADMIN for approval step
  - USER_COOKIE: session cookie string for an authenticated EMPLOYEE to create requests

  Usage:
    BASE_URL=https://toff-xyz.vercel.app \
    AUTH_COOKIE='next-auth.session-token=...' \
    USER_COOKIE='next-auth.session-token=...' \
    node scripts/test-overtime-flow.js
*/

const BASE_URL = process.env.BASE_URL;
const AUTH_COOKIE = process.env.AUTH_COOKIE;
const USER_COOKIE = process.env.USER_COOKIE;

if (!BASE_URL || !AUTH_COOKIE || !USER_COOKIE) {
  console.error('Missing env. Set BASE_URL, AUTH_COOKIE, USER_COOKIE');
  process.exit(1);
}

async function fetchJson(url, opts = {}) {
  const res = await fetch(url, opts);
  const text = await res.text();
  try {
    const json = text ? JSON.parse(text) : {};
    return { ok: res.ok, status: res.status, json };
  } catch {
    return { ok: res.ok, status: res.status, json: { raw: text } };
  }
}

async function getBalance(cookie) {
  return fetchJson(`${BASE_URL}/api/time-off/balance`, {
    headers: { Cookie: cookie }
  });
}

async function createOvertime(hours, notes, cookie) {
  const body = {
    hours,
    notes,
    // server will set requestDate/month/year
  };
  return fetchJson(`${BASE_URL}/api/overtime/requests`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookie,
    },
    body: JSON.stringify(body),
  });
}

async function listOvertime(cookie) {
  return fetchJson(`${BASE_URL}/api/overtime/requests`, {
    headers: { Cookie: cookie }
  });
}

async function approveOvertime(id, cookie) {
  return fetchJson(`${BASE_URL}/api/overtime/requests/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookie,
    },
    body: JSON.stringify({ status: 'APPROVED' }),
  });
}

(async () => {
  console.log('BASE_URL =', BASE_URL);
  // 1) Record initial balance as ADMIN (same as employee in effect)
  const before = await getBalance(USER_COOKIE);
  console.log('Initial balance:', before.status, before.json);

  // 2) Create overtime as EMPLOYEE
  const hours = 8; // equals 1 day
  const create = await createOvertime(hours, 'e2e test', USER_COOKIE);
  console.log('Create overtime:', create.status, create.json);
  if (!create.ok) process.exit(1);

  // 3) List as ADMIN and find the new request id
  const list = await listOvertime(AUTH_COOKIE);
  console.log('Overtime list (admin):', list.status, list.json);
  if (!list.ok) process.exit(1);
  const pending = Array.isArray(list.json) ? list.json.find(r => r.status === 'PENDING') : null;
  if (!pending) {
    console.error('No pending overtime found');
    process.exit(1);
  }

  // 4) Approve as ADMIN
  const approve = await approveOvertime(pending.id, AUTH_COOKIE);
  console.log('Approve response:', approve.status, approve.json);
  if (!approve.ok) process.exit(1);

  // 5) Check balance after approval
  const after = await getBalance(USER_COOKIE);
  console.log('Final balance:', after.status, after.json);

  console.log('Done. Verify that vacationDays increased by', hours / 8, 'day(s).');
})();
