import { supabase } from '@/lib/supabase'

export default async function Home() {
  const { data: sports, error } = await supabase.from('sports').select('*')

  return (
    <main className="min-h-screen p-8">
      <h1 className="text-3xl font-bold mb-6">All Sports Live Scores</h1>
      {error && <p className="text-red-500">Error: {error.message}</p>}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {sports?.map((sport) => (
          <div key={sport.id} className="border rounded-lg p-4 text-center">
            <p className="font-semibold">{sport.name}</p>
          </div>
        ))}
      </div>
    </main>
  )
}