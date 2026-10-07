// Visual parity with ssr-agent's app/widgets/weather-widget.tsx, minus the
// artificial latency/Suspense angle -- there's no RSC streaming to make
// visible here, just a plain client component rendered from the backend's
// tool args.
export function WeatherWidget({ location }: { location: string }) {
  const mockConditions = ['Sunny', 'Partly cloudy', 'Light rain', 'Windy']
  const condition = mockConditions[location.length % mockConditions.length]
  const tempC = 8 + (location.length % 15)

  return (
    <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        showWeather
      </p>
      <h3 className="mt-1 text-lg font-semibold">{location}</h3>
      <p className="text-neutral-600 dark:text-neutral-400">
        {condition}, {tempC}&deg;C
      </p>
    </div>
  )
}
