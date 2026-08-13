import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)

async function fetchMatches(status: string, apiKey: string) {
  const res = await fetch(`https://api.livetennisapi.com/api/public/v1/matches?status=${status}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  return res.json()
}

export async function GET() {
  try {
    const apiKey = process.env.TENNIS_API_KEY!
    const { data: sport } = await supabase
      .from('sports')
      .select('id')
      .eq('slug', 'tennis')
      .single()

    const [liveJson, upcomingJson] = await Promise.all([
      fetchMatches('live', apiKey),
      fetchMatches('upcoming', apiKey),
    ])

    const matches = [...(liveJson.data || []), ...(upcomingJson.data || [])]

    let synced = 0
    const seenIds: string[] = []

    for (const m of matches) {
      const externalId = String(m.id)
      seenIds.push(externalId)

      const status = m.status === 'live' ? 'live' : m.status === 'completed' ? 'finished' : 'upcoming'

      const { error } = await supabase.from('matches').upsert(
        {
          external_id: externalId,
          sport_id: sport?.id,
          tournament_name: m.tournament,
          home_team_name: m.players?.p1?.name,
          away_team_name: m.players?.p2?.name,
          status,
          home_score: m.score?.sets?.[0] ?? 0,
          away_score: m.score?.sets?.[1] ?? 0,
          start_time: m.scheduled_time,
          match_info: m.round || m.event_status,
          raw_data: m,
        },
        { onConflict: 'external_id' }
      )
      if (!error) synced++
    }

    // Best-effort: if a match we previously had as live/upcoming didn't show up
    // in this fetch at all, assume it has finished (free tier has no direct way to confirm).
    if (seenIds.length > 0) {
      await supabase
        .from('matches')
        .update({ status: 'finished' })
        .eq('sport_id', sport?.id)
        .in('status', ['live', 'upcoming'])
        .not('external_id', 'in', `(${seenIds.join(',')})`)
    }

    return NextResponse.json({ synced, total: matches.length })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}