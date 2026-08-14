import { NextResponse } from 'next/server';

export async function GET() {
  const apiKey = process.env.API_SPORTS_KEY;
  const res = await fetch('https://v1.baseball.api-sports.io/status', {
    headers: { 'x-apisports-key': apiKey as string },
    cache: 'no-store',
  });
  const data = await res.json();
  return NextResponse.json(data);
}