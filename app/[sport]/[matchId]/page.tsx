import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import Link from 'next/link'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)

const STALE_MINUTES = 10

export default async function MatchDetailPage({
  params,
}: {
  params: Promise<{ sport: string; matchId: string }>
}) {
  const { sport: sportSlug, matchId } = await params

  const { data: match } = await supabase
    .from('matches')
    .select('*')
    .eq('external_id', matchId)
    .single()

  if (!match) {
    notFound()
  }

  let raw = match.raw_data || {}
  let extra = match.scorecard as any
  const updatedAt = match.scorecard_updated_at ? new Date(match.scorecard_updated_at) : null
  const isStale =
    !updatedAt ||
    (match.status === 'live' && Date.now() - updatedAt.getTime() > STALE_MINUTES * 60 * 1000)

  if (sportSlug === 'cricket' && (!extra || isStale) && match.status !== 'upcoming') {
    try {
      const apiKey = process.env.CRICAPI_KEY
      const res = await fetch(
        `https://api.cricapi.com/v1/match_scorecard?apikey=${apiKey}&id=${matchId}`,
        { cache: 'no-store' }
      )
      const json = await res.json()
      if (json.status === 'success' && json.data?.scorecard) {
        extra = json.data.scorecard
        await supabase
          .from('matches')
          .update({ scorecard: extra, scorecard_updated_at: new Date().toISOString() })
          .eq('external_id', matchId)
      }
    } catch {}
  }

  if (sportSlug === 'football' && (!extra || isStale) && match.status !== 'upcoming') {
    try {
      const apiKey = process.env.API_SPORTS_KEY!
      const [eventsRes, fixtureRes] = await Promise.all([
        fetch(`https://v3.football.api-sports.io/fixtures/events?fixture=${matchId}`, {
          headers: { 'x-apisports-key': apiKey },
          cache: 'no-store',
        }),
        fetch(`https://v3.football.api-sports.io/fixtures?id=${matchId}`, {
          headers: { 'x-apisports-key': apiKey },
          cache: 'no-store',
        }),
      ])
      const eventsJson = await eventsRes.json()
      const fixtureJson = await fixtureRes.json()

      const updates: any = { scorecard_updated_at: new Date().toISOString() }

      if (eventsJson.response) {
        extra = eventsJson.response
        updates.scorecard = extra
      }

      if (fixtureJson.response?.[0]) {
        const freshFixture = fixtureJson.response[0]
        updates.raw_data = freshFixture
        updates.home_score = freshFixture.goals?.home ?? match.home_score
        updates.away_score = freshFixture.goals?.away ?? match.away_score
        updates.match_info = freshFixture.fixture?.status?.long

        const shortStatus = freshFixture.fixture?.status?.short
        if (['1H', 'HT', '2H', 'ET', 'BT', 'P', 'LIVE', 'INT'].includes(shortStatus)) {
          updates.status = 'live'
        } else if (['NS', 'TBD'].includes(shortStatus)) {
          updates.status = 'upcoming'
        } else {
          updates.status = 'finished'
        }

        raw = freshFixture
        match.home_score = updates.home_score
        match.away_score = updates.away_score
        match.match_info = updates.match_info
        match.status = updates.status
      }

      await supabase.from('matches').update(updates).eq('external_id', matchId)
    } catch {}
  }

  const venueName = sportSlug === 'football' ? raw.fixture?.venue?.name : raw.venue
  const teamInfo =
    sportSlug === 'football'
      ? [raw.teams?.home, raw.teams?.away].filter(Boolean)
      : raw.teamInfo || []

  return (
    <main className="max-w-3xl mx-auto px-4 py-8">
      <Link href={`/${sportSlug}`} className="text-sm text-blue-600 hover:underline">
        ← Back to {sportSlug}
      </Link>

      <h1 className="text-xl font-bold mt-4">{match.tournament_name}</h1>
      <p className="text-gray-500 text-sm mb-6">{venueName}</p>

      <div className="border rounded-lg p-4 mb-6">
        <div className="flex justify-between items-center mb-2">
          <p className="font-medium">
            {match.home_team_name} vs {match.away_team_name}
          </p>
          <p className="font-semibold">
            {match.home_score ?? 0} - {match.away_score ?? 0}
          </p>
        </div>

        {sportSlug === 'football' && match.status === 'live' && raw.fixture?.status && (
          <p className="text-sm text-red-500 font-medium mb-1">
            {raw.fixture.status.elapsed}
            {raw.fixture.status.elapsed ? "'" : ''} {raw.fixture.status.short === 'HT' ? '(Half Time)' : ''}
          </p>
        )}

        {match.match_info && <p className="text-sm text-gray-600">{match.match_info}</p>}

        {sportSlug === 'cricket' && raw.score?.length > 0 && (
          <div className="space-y-2 mt-3">
            {raw.score.map((inn: any, idx: number) => (
              <div key={idx} className="flex justify-between text-sm border-t pt-2">
                <span>{inn.inning}</span>
                <span className="font-semibold">
                  {inn.r}/{inn.w} ({inn.o} ov)
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {sportSlug === 'football' && Array.isArray(extra) && extra.length > 0 && (
        <section className="mb-8">
          <h2 className="font-semibold mb-3">Match Events</h2>
          <div className="space-y-2">
            {extra
              .filter((e: any) => e.type === 'Goal')
              .map((e: any, idx: number) => (
                <div key={idx} className="flex justify-between text-sm border-b pb-2">
                  <span>
                    ⚽ {e.player?.name || 'Goal'}
                    {e.assist?.name ? ` (assist: ${e.assist.name})` : ''} — {e.team?.name}
                  </span>
                  <span className="font-medium">
                    {e.time?.elapsed}
                    {e.time?.extra ? `+${e.time.extra}` : ''}'
                  </span>
                </div>
              ))}
            {extra.filter((e: any) => e.type !== 'Goal').length > 0 && (
              <details className="text-sm text-gray-500 mt-3">
                <summary className="cursor-pointer">Other events (cards, subs)</summary>
                <div className="mt-2 space-y-1">
                  {extra
                    .filter((e: any) => e.type !== 'Goal')
                    .map((e: any, idx: number) => (
                      <div key={idx} className="flex justify-between">
                        <span>
                          {e.type === 'Card' ? (e.detail === 'Yellow Card' ? '🟨' : '🟥') : '🔄'}{' '}
                          {e.player?.name || e.team?.name}
                        </span>
                        <span>{e.time?.elapsed}'</span>
                      </div>
                    ))}
                </div>
              </details>
            )}
          </div>
        </section>
      )}

      {sportSlug === 'cricket' && Array.isArray(extra) && extra.length > 0 && (
        <div className="space-y-8">
          <h2 className="font-semibold -mb-4">Full Scorecard</h2>
          {extra.map((inning: any, idx: number) => (
            <section key={idx}>
              <h3 className="font-medium mb-3 text-gray-700">{inning.inning}</h3>
              {inning.batting?.length > 0 && (
                <div className="mb-4 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-400 border-b">
                        <th className="py-1 pr-2">Batter</th>
                        <th className="py-1 px-2 text-right">R</th>
                        <th className="py-1 px-2 text-right">B</th>
                        <th className="py-1 px-2 text-right">4s</th>
                        <th className="py-1 px-2 text-right">6s</th>
                        <th className="py-1 pl-2 text-right">SR</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inning.batting.map((b: any, i: number) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="py-1 pr-2">
                            <div>{b.batsman?.name}</div>
                            <div className="text-xs text-gray-400">{b['dismissal-text']}</div>
                          </td>
                          <td className="py-1 px-2 text-right font-medium">{b.r}</td>
                          <td className="py-1 px-2 text-right">{b.b}</td>
                          <td className="py-1 px-2 text-right">{b['4s']}</td>
                          <td className="py-1 px-2 text-right">{b['6s']}</td>
                          <td className="py-1 pl-2 text-right">{b.sr}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {inning.bowling?.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-400 border-b">
                        <th className="py-1 pr-2">Bowler</th>
                        <th className="py-1 px-2 text-right">O</th>
                        <th className="py-1 px-2 text-right">M</th>
                        <th className="py-1 px-2 text-right">R</th>
                        <th className="py-1 px-2 text-right">W</th>
                        <th className="py-1 pl-2 text-right">Econ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inning.bowling.map((b: any, i: number) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="py-1 pr-2">{b.bowler?.name}</td>
                          <td className="py-1 px-2 text-right">{b.o}</td>
                          <td className="py-1 px-2 text-right">{b.m}</td>
                          <td className="py-1 px-2 text-right">{b.r}</td>
                          <td className="py-1 px-2 text-right font-medium">{b.w}</td>
                          <td className="py-1 pl-2 text-right">{b.eco}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ))}
        </div>
      )}

      {teamInfo.length > 0 && (
        <div className="flex gap-6 mt-8">
          {teamInfo.map((t: any) => (
            <div key={t.name} className="flex items-center gap-2 text-sm text-gray-600">
              {(t.img || t.logo) && (
                <img src={t.img || t.logo} alt={t.name} className="w-6 h-6 rounded-full" />
              )}
              {t.name}
            </div>
          ))}
        </div>
      )}
    </main>
  )
}