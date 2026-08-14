import { NextResponse } from 'next/server';

export async function GET() {
  const apiKey = process.env.CRICAPI_KEY;
  const res = await fetch(
    `https://api.cricapi.com/v1/currentMatches?apikey=${apiKey}&offset=0`,
    { cache: 'no-store' }
  );
  const data = await res.json();
  return NextResponse.json(data);
}