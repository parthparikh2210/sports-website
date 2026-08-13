import { NextResponse } from 'next/server'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ matchId: string }> }
) {
  const { matchId } = await params
  const apiKey = process.env.CRICAPI_KEY

  const res = await fetch(
    `https://api.cricapi.com/v1/match_scorecard?apikey=${apiKey}&id=${matchId}`
  )
  const json = await res.json()

  return NextResponse.json(json)
}