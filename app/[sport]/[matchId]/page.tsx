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

  let scorecard = match.scorecard as any[] | null
  const updatedAt = match.scorecard_updated_at ? new Date(match.scorecard_updated_at) : null
  const isStale =
    !updatedAt ||
    (match.status === 'live' && Date.now() - updatedAt.getTime() > STALE_MINUTES * 60 * 1000)

  if ((!scorecard || isStale) && match.status !== 'upcoming') {
    try {
      const apiKey = process.env.CRICAPI_KEY
      const res = await fetch(
        `https://api.cricapi.com/v1/match_scorecard?apikey=${apiKey}&id=${matchId}`,
        { cache: 'no-store' }
      )
      const json = await res.json()

      if (json.status === 'success' && json.data?.scorecard) {
        scorecard = json.data.scorecard
        await supabase
          .from('matches')
          .update({ scorecard, scorecard_updated_at: new Date().toISOString() })
          .eq('external_id', matchId)
      }
    } catch {
      // keep whatever was already cached, if anything
    }
  }

  const raw = match.raw_data || {}
  const teamInfo = raw.teamInfo || []
  const inningsSummary = raw.score || []

  return (
    <main className="max-w-3xl mx-auto px-4 py-8">
      <Link href={`/${sportSlug}`} className="text-sm text-blue-600 hover:underline">
        ← Back to {sportSlug}
      </Link>

      <h1 className="text-xl font-bold mt-4">{match.tournament_name}</h1>
      <p className="text-gray-500 text-sm mb-6">
        {raw.venue} {raw.date ? `• ${raw.date}` : ''}
      </p>

      <div className="border rounded-lg p-4 mb-6">
        <p className="font-medium mb-3">
          {match.home_team_name} vs {match.away_team_name}
        </p>
        {match.match_info && <p className="text-sm text-gray-600 mb-4">{match.match_info}</p>}

        {inningsSummary.length > 0 && (
          <div className="space-y-2">
            {inningsSummary.map((inn: any, idx: number) => (
              <div
                key={idx}
                className="flex justify-between text-sm border-t pt-2 first:border-t-0 first:pt-0"
              >
                <span>{inn.inning}</span>
                <span className="font-semibold">
                  {inn.r}/{inn.w} ({inn.o} ov)
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {scorecard && scorecard.length > 0 ? (
        <div className="space-y-8">
          <h2 className="font-semibold -mb-4">Full Scorecard</h2>
          {scorecard.map((inning: any, idx: number) => (
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
      ) : (
        <p className="text-sm text-gray-400">Full scorecard not available yet.</p>
      )}

      {teamInfo.length > 0 && (
        <div className="flex gap-6 mt-8">
          {teamInfo.map((t: any) => (
            <div key={t.name} className="flex items-center gap-2 text-sm text-gray-600">
              {t.img && <img src={t.img} alt={t.name} className="w-6 h-6 rounded-full" />}
              {t.name}
            </div>
          ))}
        </div>
      )}
    </main>
  )
}