import { NextResponse } from 'next/server';

export async function GET() {
  const apiKey = process.env.TENNIS_API_KEY;
  const res = await fetch('https://api.livetennisapi.com/api/public/v1/matches?status=live', {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: 'no-store',
  });
  const data = await res.json();
  const headers: Record<string, string> = {};
  res.headers.forEach((value, key) => {
    headers[key] = value;
  });
  return NextResponse.json({ headers, data });
}