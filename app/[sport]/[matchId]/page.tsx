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

  if (sportSlug === 'tennis' && (!extra || isStale) && match.status !== 'upcoming') {
    try {
      const apiKey = process.env.TENNIS_API_KEY!
      const res = await fetch(
        `https://api.livetennisapi.com/api/public/v1/matches/${matchId}/score`,
        { headers: { Authorization: `Bearer ${apiKey}` }, cache: 'no-store' }
      )
      const scoreJson = await res.json()

      if (scoreJson && !scoreJson.error) {
        extra = scoreJson
        raw = { ...raw, score: scoreJson }
        const homeScore = scoreJson.sets?.[0] ?? match.home_score
        const awayScore = scoreJson.sets?.[1] ?? match.away_score
        match.home_score = homeScore
        match.away_score = awayScore

        await supabase
          .from('matches')
          .update({
            scorecard: extra,
            raw_data: raw,
            home_score: homeScore,
            away_score: awayScore,
            scorecard_updated_at: new Date().toISOString(),
          })
          .eq('external_id', matchId)
      }
    } catch {}
  }

  if (sportSlug === 'baseball' && (!extra || isStale) && match.status !== 'upcoming') {
    try {
      const apiKey = process.env.API_SPORTS_KEY!
      const res = await fetch(`https://v1.baseball.api-sports.io/games?id=${matchId}`, {
        headers: { 'x-apisports-key': apiKey },
        cache: 'no-store',
      })
      const json = await res.json()
      const freshGame = json.response?.[0]

      if (freshGame) {
        raw = freshGame
        extra = freshGame.scores
        match.home_score = freshGame.scores?.home?.total ?? match.home_score
        match.away_score = freshGame.scores?.away?.total ?? match.away_score
        match.match_info = freshGame.status?.long

        const shortStatus = freshGame.status?.short
        match.status = shortStatus?.startsWith('IN') ? 'live' : shortStatus === 'NS' ? 'upcoming' : 'finished'

        await supabase
          .from('matches')
          .update({
            raw_data: raw,
            scorecard: extra,
            home_score: match.home_score,
            away_score: match.away_score,
            match_info: match.match_info,
            status: match.status,
            scorecard_updated_at: new Date().toISOString(),
          })
          .eq('external_id', matchId)
      }
    } catch {}
  }

  // MLB-only: pull real batting/pitching stats from the free official MLB Stats API,
  // matched to this game by date + team name (API-Baseball has no player-stats endpoint).
  let mlbBoxscore: any = null
  if (sportSlug === 'baseball' && match.tournament_name === 'MLB' && match.start_time) {
    try {
      const dateStr = new Date(match.start_time).toISOString().slice(0, 10)
      const scheduleRes = await fetch(
        `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${dateStr}`,
        { cache: 'no-store' }
      )
      const scheduleJson = await scheduleRes.json()
      const games = scheduleJson.dates?.[0]?.games || []

      const normalize = (s: string) => (s || '').toLowerCase().trim()
      const lastWord = (s: string) => normalize(s).split(' ').pop()
      const sameTeam = (mlbName: string, ourName: string) => {
        const a = normalize(mlbName)
        const b = normalize(ourName)
        if (!a || !b) return false
        return a === b || a.includes(b) || b.includes(a) || lastWord(mlbName) === lastWord(ourName)
      }

      const gameMatch = games.find(
        (g: any) =>
          sameTeam(g.teams?.home?.team?.name, match.home_team_name) &&
          sameTeam(g.teams?.away?.team?.name, match.away_team_name)
      )

      if (gameMatch?.gamePk) {
        const boxRes = await fetch(
          `https://statsapi.mlb.com/api/v1/game/${gameMatch.gamePk}/boxscore`,
          { cache: 'no-store' }
        )
        mlbBoxscore = await boxRes.json()
      }
    } catch {}
  }

  const venueName = sportSlug === 'football' ? raw.fixture?.venue?.name : raw.venue
  const teamInfo =
    sportSlug === 'football' || sportSlug === 'baseball'
      ? [raw.teams?.home, raw.teams?.away].filter(Boolean)
      : sportSlug === 'tennis'
      ? [raw.players?.p1, raw.players?.p2].filter(Boolean)
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

        {sportSlug === 'tennis' && match.status === 'live' && raw.score?.points && (
          <p className="text-sm text-red-500 font-medium mt-2">
            Current game: {raw.score.points[0]} - {raw.score.points[1]}
            {raw.score.is_tiebreak ? ' (Tiebreak)' : ''}
            {raw.score.server
              ? ` — ${raw.score.server === 1 ? match.home_team_name : match.away_team_name} serving`
              : ''}
          </p>
        )}
      </div>

      {sportSlug === 'baseball' && raw.scores && (
        <section className="mb-8">
          <h2 className="font-semibold mb-3">Box Score</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 border-b">
                  <th className="py-1 pr-2">Team</th>
                  {Object.keys(raw.scores.home?.innings || {})
                    .filter((k) => k !== 'extra')
                    .map((inn) => (
                      <th key={inn} className="py-1 px-2 text-right">
                        {inn}
                      </th>
                    ))}
                  <th className="py-1 px-2 text-right font-semibold">R</th>
                  <th className="py-1 px-2 text-right">H</th>
                  <th className="py-1 pl-2 text-right">E</th>
                </tr>
              </thead>
              <tbody>
                {['away', 'home'].map((side) => (
                  <tr key={side} className="border-b last:border-0">
                    <td className="py-1 pr-2">
                      {side === 'away' ? match.away_team_name : match.home_team_name}
                    </td>
                    {Object.keys(raw.scores.home?.innings || {})
                      .filter((k) => k !== 'extra')
                      .map((inn) => (
                        <td key={inn} className="py-1 px-2 text-right">
                          {raw.scores[side]?.innings?.[inn] ?? '-'}
                        </td>
                      ))}
                    <td className="py-1 px-2 text-right font-semibold">{raw.scores[side]?.total ?? '-'}</td>
                    <td className="py-1 px-2 text-right">{raw.scores[side]?.hits ?? '-'}</td>
                    <td className="py-1 pl-2 text-right">{raw.scores[side]?.errors ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {sportSlug === 'baseball' && mlbBoxscore?.teams && (
        <div className="space-y-8 mb-8">
          <h2 className="font-semibold -mb-4">Player Stats</h2>
          {['away', 'home'].map((side) => {
            const team = mlbBoxscore.teams[side]
            const teamLabel = side === 'away' ? match.away_team_name : match.home_team_name
            const batterIds: number[] = team?.batters || []
            const pitcherIds: number[] = team?.pitchers || []

            return (
              <section key={side}>
                <h3 className="font-medium mb-3 text-gray-700">{teamLabel}</h3>

                {batterIds.length > 0 ? (
                  <div className="mb-4 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-gray-400 border-b">
                          <th className="py-1 pr-2">Batter</th>
                          <th className="py-1 px-2 text-right">AB</th>
                          <th className="py-1 px-2 text-right">R</th>
                          <th className="py-1 px-2 text-right">H</th>
                          <th className="py-1 px-2 text-right">RBI</th>
                          <th className="py-1 px-2 text-right">BB</th>
                          <th className="py-1 pl-2 text-right">SO</th>
                        </tr>
                      </thead>
                      <tbody>
                        {batterIds.map((id) => {
                          const p = team.players?.[`ID${id}`]
                          const b = p?.stats?.batting || {}
                          return (
                            <tr key={id} className="border-b last:border-0">
                              <td className="py-1 pr-2">
                                <div>{p?.person?.fullName}</div>
                                <div className="text-xs text-gray-400">{p?.position?.abbreviation}</div>
                              </td>
                              <td className="py-1 px-2 text-right">{b.atBats ?? 0}</td>
                              <td className="py-1 px-2 text-right">{b.runs ?? 0}</td>
                              <td className="py-1 px-2 text-right font-medium">{b.hits ?? 0}</td>
                              <td className="py-1 px-2 text-right">{b.rbi ?? 0}</td>
                              <td className="py-1 px-2 text-right">{b.baseOnBalls ?? 0}</td>
                              <td className="py-1 pl-2 text-right">{b.strikeOuts ?? 0}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 mb-4">Lineup not posted yet.</p>
                )}

                {pitcherIds.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-gray-400 border-b">
                          <th className="py-1 pr-2">Pitcher</th>
                          <th className="py-1 px-2 text-right">IP</th>
                          <th className="py-1 px-2 text-right">H</th>
                          <th className="py-1 px-2 text-right">R</th>
                          <th className="py-1 px-2 text-right">ER</th>
                          <th className="py-1 px-2 text-right">BB</th>
                          <th className="py-1 pl-2 text-right">SO</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pitcherIds.map((id) => {
                          const p = team.players?.[`ID${id}`]
                          const pitch = p?.stats?.pitching || {}
                          return (
                            <tr key={id} className="border-b last:border-0">
                              <td className="py-1 pr-2">{p?.person?.fullName}</td>
                              <td className="py-1 px-2 text-right">{pitch.inningsPitched ?? '0.0'}</td>
                              <td className="py-1 px-2 text-right">{pitch.hits ?? 0}</td>
                              <td className="py-1 px-2 text-right">{pitch.runs ?? 0}</td>
                              <td className="py-1 px-2 text-right">{pitch.earnedRuns ?? 0}</td>
                              <td className="py-1 px-2 text-right">{pitch.baseOnBalls ?? 0}</td>
                              <td className="py-1 pl-2 text-right font-medium">{pitch.strikeOuts ?? 0}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )
          })}
        </div>
      )}

      {sportSlug === 'tennis' && (
        <section className="mb-8">
          <h2 className="font-semibold mb-3">Set by Set</h2>
          {raw.score?.games?.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-400 border-b">
                    <th className="py-1 pr-2"></th>
                    {raw.score.games.map((_: any, i: number) => (
                      <th key={i} className="py-1 px-2 text-right">
                        Set {i + 1}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td className="py-1 pr-2 font-medium">{match.home_team_name}</td>
                    {raw.score.games.map((g: any, i: number) => (
                      <td key={i} className="py-1 px-2 text-right">
                        {g[0]}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-1 pr-2 font-medium">{match.away_team_name}</td>
                    {raw.score.games.map((g: any, i: number) => (
                      <td key={i} className="py-1 px-2 text-right">
                        {g[1]}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-gray-400">Set details not available yet.</p>
          )}
        </section>
      )}

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
        <div className="flex gap-6 mt-8 flex-wrap">
          {teamInfo.map((t: any, i: number) => (
            <div key={t.name || i} className="flex items-center gap-2 text-sm text-gray-600">
              {(t.img || t.logo) && (
                <img src={t.img || t.logo} alt={t.name} className="w-6 h-6 rounded-full" />
              )}
              <span>
                {t.name}
                {t.country ? ` (${t.country})` : ''}
                {t.ranking ? ` — Rank #${t.ranking}` : ''}
              </span>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}