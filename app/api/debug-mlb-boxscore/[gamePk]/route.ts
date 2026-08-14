import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ gamePk: string }> }
) {
  const { gamePk } = await params;

  const res = await fetch(
    `https://statsapi.mlb.com/api/v1/game/${gamePk}/boxscore`
  );
  const data = await res.json();

  return NextResponse.json(data);
}