"use client";

import {
  Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow,
  CloudSun, Moon, Sun, Thermometer,
} from "lucide-react";
import type { WeatherBlock } from "@/lib/blocks/kinds/weather";
import { weatherMood, type WeatherMood } from "@/lib/blocks/kinds/weather-style";

// Keep palette classes literal in this component so Tailwind's scanner includes every weather state.
const WEATHER_PALETTES: Record<WeatherMood, { gradient: string; glow: string; icon: string; range: string }> = {
  clear: { gradient: "from-[#63b8ec] via-[#438bd2] to-[#435fba]", glow: "bg-[#d7f0ff]/30", icon: "text-[#fff1a9]", range: "from-[#a7eef2] to-[#ffe28a]" },
  cloudy: { gradient: "from-[#849eb5] via-[#617b98] to-[#405b7d]", glow: "bg-[#e4f0ff]/25", icon: "text-white", range: "from-[#b6dce9] to-[#f1e1b2]" },
  rain: { gradient: "from-[#527b9d] via-[#3c5b7c] to-[#293f65]", glow: "bg-[#c2e6ff]/20", icon: "text-[#e4f3ff]", range: "from-[#83dbe4] to-[#d9e9f2]" },
  snow: { gradient: "from-[#9bb9cb] via-[#718da9] to-[#536d91]", glow: "bg-[#f1fbff]/30", icon: "text-white", range: "from-[#c8f2f6] to-[#fff2cb]" },
  storm: { gradient: "from-[#66658e] via-[#464d78] to-[#2f3d65]", glow: "bg-[#e2d9ff]/20", icon: "text-[#ece8ff]", range: "from-[#b6a8ff] to-[#90d9ea]" },
  night: { gradient: "from-[#354b78] via-[#26365d] to-[#172543]", glow: "bg-[#9ab9ff]/20", icon: "text-[#ffe9a1]", range: "from-[#86bddd] to-[#d2c5ff]" },
};

function conditionIcon(code?: number, isDay = true, className = "h-5 w-5") {
  if (code == null) return <Cloud className={className} strokeWidth={1.7} />;
  if (code === 0 || code === 1) {
    const Icon = isDay ? Sun : Moon;
    return <Icon className={className} strokeWidth={1.7} />;
  }
  if (code === 2) return <CloudSun className={className} strokeWidth={1.7} />;
  if (code === 45 || code === 48) return <CloudFog className={className} strokeWidth={1.7} />;
  if (code === 95 || code === 96 || code === 99) return <CloudLightning className={className} strokeWidth={1.7} />;
  if ([71, 73, 75, 77, 85, 86].includes(code)) return <CloudSnow className={className} strokeWidth={1.7} />;
  if ([51, 53, 55, 56, 57].includes(code)) return <CloudDrizzle className={className} strokeWidth={1.7} />;
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return <CloudRain className={className} strokeWidth={1.7} />;
  return <Cloud className={className} strokeWidth={1.7} />;
}

export function WeatherView({ block }: { block: WeatherBlock }) {
  const ka = block.locale.toLowerCase().startsWith("ka");
  const labels = block.labels;
  const { current } = block;
  const mood = weatherMood(current.condition.code, current.condition.text, current.isDay ?? true);
  const palette = WEATHER_PALETTES[mood];
  const hours = block.hours.slice(0, 6);
  const days = hours.length ? [] : block.days.slice(0, 3);
  const showDailyForecast = days.length > 1;
  const temperature = current.tempC != null
    ? `${Math.round(current.tempC)}°`
    : current.tempRangeC
      ? `${Math.round(current.tempRangeC[0])}–${Math.round(current.tempRangeC[1])}°`
      : null;
  const metrics = [
    current.feelsLikeC == null ? null : { icon: <Thermometer className="h-4 w-4" />, label: labels?.feelsLike ?? (ka ? "იგრძნობა" : "Feels like"), value: `${Math.round(current.feelsLikeC)}°` },
  ].filter((item): item is NonNullable<typeof item> => item !== null);

  return (
    <section className={`relative isolate my-4 overflow-hidden rounded-[24px] bg-gradient-to-br ${palette.gradient} text-white shadow-[0_18px_52px_-34px_rgba(47,115,180,0.65)]`}>
      <div aria-hidden="true" className={`pointer-events-none absolute -right-14 -top-24 h-64 w-64 rounded-full blur-3xl ${palette.glow}`} />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[linear-gradient(150deg,rgba(255,255,255,0.13),transparent_43%,rgba(9,20,55,0.16))]" />

      <div className="relative p-4 sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="truncate text-[16px] font-semibold tracking-[-0.02em] text-white">{block.location}</p>
            {block.localTime ? <p className="mt-0.5 text-[11px] text-white/70">{labels?.current ?? (ka ? "ახლა" : "Now")} · {block.localTime.slice(-5)}</p> : null}
          </div>
          <div className={`shrink-0 pt-0.5 ${palette.icon}`}>
            {conditionIcon(current.condition.code, current.isDay ?? true, "h-8 w-8")}
          </div>
        </div>

        <div className={`mt-1 flex flex-wrap items-end justify-between gap-x-5 gap-y-1 ${temperature ? "" : "pt-2"}`}>
          {temperature ? <span className="text-[64px] font-extralight leading-[0.95] tracking-[-0.08em] text-white sm:text-[72px]">{temperature}</span> : null}
          <div className={`min-w-0 pb-1 ${temperature ? "text-right sm:ml-auto" : "text-left"}`}>
            <p className="max-w-[240px] text-[15px] font-medium leading-snug text-white">{current.condition.text}</p>
            {!showDailyForecast && block.days[0] ? <p className="mt-1 text-[13px] text-white/75">{labels?.today ?? (ka ? "დღეს" : "Today")} {Math.round(block.days[0].maxC)}° <span className="text-white/45">/</span> {Math.round(block.days[0].minC)}°</p> : null}
          </div>
        </div>

        {metrics.length ? (
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
            {metrics.map((item) => (
              <div key={item.label} className="flex items-center gap-2 text-white/80">
                <span className="text-white/70">{item.icon}</span>
                <span className="text-[12px]">{item.label}</span>
                <span className="text-[13px] font-semibold text-white">{item.value}</span>
              </div>
            ))}
          </div>
        ) : null}

        {hours.length || days.length ? (
          <div className="mt-4 border-t border-white/15 pt-3">
            <div className="flex snap-x gap-1 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {hours.map((item, index) => (
                <div
                  key={`${item.time}-${index}`}
                  aria-label={`${item.time}, ${item.condition.text}, ${Math.round(item.tempC)}°`}
                  className="flex min-w-[48px] flex-1 snap-start flex-col items-center gap-1 px-1 py-1 text-center"
                >
                  <span className="text-[10px] text-white/70">{item.time}</span>
                  <span className={palette.icon}>{conditionIcon(item.condition.code, current.isDay ?? true, "h-5 w-5")}</span>
                  <span className="text-[13px] font-medium text-white">{Math.round(item.tempC)}°</span>
                </div>
              ))}
              {days.map((item, index) => {
                const date = new Date(`${item.date}T12:00:00`);
                const weekday = new Intl.DateTimeFormat(ka ? "ka-GE" : "en", { weekday: "short" }).format(date);
                return (
                  <div
                    key={`${item.date}-${index}`}
                    aria-label={`${weekday}, ${item.condition.text}, ${Math.round(item.minC)}° to ${Math.round(item.maxC)}°`}
                    className="flex min-w-[56px] flex-1 snap-start flex-col items-center gap-1 px-1 py-1 text-center"
                  >
                    <span className="text-[10px] text-white/70">{weekday}</span>
                    <span className={palette.icon}>{conditionIcon(item.condition.code, true, "h-5 w-5")}</span>
                    <span className="whitespace-nowrap text-[12px] font-medium text-white">{Math.round(item.minC)}° <span className="text-white/55">/</span> {Math.round(item.maxC)}°</span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

      </div>
    </section>
  );
}
