import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)

function mapStatus(short: string): 'live' | 'upcoming' | 'finished' {
  if (['1H', 'HT', '2H', 'ET', 'BT', 'P', 'LIVE', 'INT'].includes(short)) return 'live'
  if (['NS', 'TBD'].includes(short)) return 'upcoming'
  return 'finished'
}

async function fetchFixtures(url: string, apiKey: string) {
  const res = await fetch(url, { headers: { 'x-apisports-key': apiKey } })
  return res.json()
}

export async function GET() {
  try {
    const apiKey = process.env.API_SPORTS_KEY!
    const { data: sport } = await supabase
      .from('sports')
      .select('id')
      .eq('slug', 'football')
      .single()

    const today = new Date().toISOString().split('T')[0]

    const [liveJson, todayJson] = await Promise.all([
      fetchFixtures('https://v3.football.api-sports.io/fixtures?live=all', apiKey),
      fetchFixtures(`https://v3.football.api-sports.io/fixtures?date=${today}`, apiKey),
    ])

    const all = [...(liveJson.response || []), ...(todayJson.response || [])]

    const seen = new Set<number>()
    const fixtures = all.filter((f: any) => {
      if (seen.has(f.fixture.id)) return false
      seen.add(f.fixture.id)
      return true
    })

    let synced = 0

    for (const f of fixtures) {
      const { error } = await supabase.from('matches').upsert(
        {
          external_id: String(f.fixture.id),
          sport_id: sport?.id,
          tournament_name: f.league?.name,
          home_team_name: f.teams?.home?.name,
          away_team_name: f.teams?.away?.name,
          status: mapStatus(f.fixture?.status?.short),
          home_score: f.goals?.home ?? 0,
          away_score: f.goals?.away ?? 0,
          start_time: f.fixture?.date,
          match_info: f.fixture?.status?.long,
          raw_data: f,
        },
        { onConflict: 'external_id' }
      )
      if (!error) synced++
    }

    return NextResponse.json({ synced, total: fixtures.length })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}