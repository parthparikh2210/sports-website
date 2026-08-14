import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)

function mapStatus(short: string): 'live' | 'upcoming' | 'finished' {
  if (short?.startsWith('IN')) return 'live'
  if (short === 'NS') return 'upcoming'
  return 'finished'
}

async function fetchGames(url: string, apiKey: string) {
  const res = await fetch(url, { headers: { 'x-apisports-key': apiKey } })
  return res.json()
}

export async function GET() {
  try {
    const apiKey = process.env.API_SPORTS_KEY!
    const { data: sport } = await supabase
      .from('sports')
      .select('id')
      .eq('slug', 'baseball')
      .single()

    const today = new Date().toISOString().split('T')[0]

    const [liveJson, todayJson] = await Promise.all([
      fetchGames('https://v1.baseball.api-sports.io/games?live=all', apiKey),
      fetchGames(`https://v1.baseball.api-sports.io/games?date=${today}`, apiKey),
    ])

    const all = [...(liveJson.response || []), ...(todayJson.response || [])]
    const seen = new Set<number>()
    const games = all.filter((g: any) => {
      if (seen.has(g.id)) return false
      seen.add(g.id)
      return true
    })

    let synced = 0

    for (const g of games) {
      const { error } = await supabase.from('matches').upsert(
        {
          external_id: String(g.id),
          sport_id: sport?.id,
          tournament_name: g.league?.name,
          home_team_name: g.teams?.home?.name,
          away_team_name: g.teams?.away?.name,
          status: mapStatus(g.status?.short),
          home_score: g.scores?.home?.total ?? 0,
          away_score: g.scores?.away?.total ?? 0,
          start_time: g.date,
          match_info: g.status?.long,
          raw_data: g,
        },
        { onConflict: 'external_id' }
      )
      if (!error) synced++
    }

    return NextResponse.json({ synced, total: games.length })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}