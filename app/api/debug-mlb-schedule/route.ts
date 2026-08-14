import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get('date'); // format: YYYY-MM-DD

  const res = await fetch(
    `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}`
  );
  const data = await res.json();

  return NextResponse.json(data);
}