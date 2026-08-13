import { NextResponse } from 'next/server'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ matchId: string }> }
) {
  const { matchId } = await params
  const apiKey = process.env.API_SPORTS_KEY

  const res = await fetch(
    `https://v3.football.api-sports.io/fixtures/events?fixture=${matchId}`,
    { headers: { 'x-apisports-key': apiKey! } }
  )
  const json = await res.json()

  return NextResponse.json(json)
}