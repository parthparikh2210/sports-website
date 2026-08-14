import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ matchId: string }> }
) {
  const { matchId } = await params;

  const res = await fetch(
    `https://v1.baseball.api-sports.io/games/statistics/players?id=${matchId}`,
    {
      headers: {
        'x-apisports-key': process.env.API_SPORTS_KEY as string,
      },
    }
  );

  const data = await res.json();
  return NextResponse.json(data);
}