import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

// Server-only client using the Secret key — bypasses the "read only" rule
// we set up for the public key, since this code never runs in the browser.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)

export async function GET() {
  try {
    const apiKey = process.env.CRICAPI_KEY
    const res = await fetch(`https://api.cricapi.com/v1/currentMatches?apikey=${apiKey}&offset=0`)
    const json = await res.json()

    if (json.status !== 'success') {
      return NextResponse.json({ error: 'CricAPI error', details: json }, { status: 500 })
    }

    const { data: sport } = await supabase
      .from('sports')
      .select('id')
      .eq('slug', 'cricket')
      .single()

    let synced = 0

    for (const match of json.data) {
      const teams = match.teams || []
      const scores = match.score || []
      const homeScoreObj = scores[0]
      const awayScoreObj = scores[1]
      const status = match.matchEnded ? 'finished' : match.matchStarted ? 'live' : 'upcoming'

      const { error } = await supabase.from('matches').upsert(
        {
          external_id: match.id,
          sport_id: sport?.id,
          tournament_name: match.name,
          home_team_name: teams[0] ?? null,
          away_team_name: teams[1] ?? null,
          status,
          home_score: homeScoreObj?.r ?? 0,
          away_score: awayScoreObj?.r ?? 0,
          start_time: match.dateTimeGMT,
          match_info: match.status,
          raw_data: match,
        },
        { onConflict: 'external_id' }
      )

      if (!error) synced++
    }

    return NextResponse.json({ synced, total: json.data.length })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}