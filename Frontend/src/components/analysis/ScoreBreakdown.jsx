import {
  ResponsiveContainer,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Tooltip,
} from "recharts";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";

function parseBreakdown(breakdown) {
  if (!breakdown) return null;

  const getRawValue = (...patterns) => {
    if (Array.isArray(breakdown)) {
      for (const pat of patterns) {
        const item = breakdown.find((b) => {
          const str = (b?.label || b?.axis || b?.name || "").toLowerCase();
          return str.includes(pat);
        });
        if (item) {
          const val = item.value ?? item.v ?? item.score;
          if (typeof val === "number" && !isNaN(val)) return val;
        }
      }
    } else if (typeof breakdown === "object") {
      for (const pat of patterns) {
        for (const [key, val] of Object.entries(breakdown)) {
          if (key.toLowerCase().includes(pat) && typeof val === "number" && !isNaN(val)) {
            return val;
          }
        }
      }
    }
    return null;
  };

  const kwRaw = getRawValue("keyword");
  const fmtRaw = getRawValue("format");
  const impRaw = getRawValue("impact");

  let clarRaw = getRawValue("clarity");
  if (clarRaw == null) {
    const read = getRawValue("readab");
    const act = getRawValue("action");
    if (read != null && act != null) {
      clarRaw = (read + act) / 2;
    } else if (read != null) {
      clarRaw = read;
    } else if (act != null) {
      clarRaw = act;
    }
  }

  // If at least one canonical axis matched
  if (kwRaw != null || fmtRaw != null || impRaw != null || clarRaw != null) {
    const allRaw = [kwRaw, fmtRaw, impRaw, clarRaw].filter((v) => v != null);
    const isOutOf100 = allRaw.some((v) => v > 25) || Array.isArray(breakdown);

    const to25 = (val) => {
      if (val == null || isNaN(val)) return 0;
      if (isOutOf100) {
        return Math.min(25, Math.max(0, Math.round((val / 100) * 25)));
      }
      return Math.min(25, Math.max(0, Math.round(val)));
    };

    return [
      { axis: "Keywords", v: to25(kwRaw), full: 25 },
      { axis: "Formatting", v: to25(fmtRaw), full: 25 },
      { axis: "Impact", v: to25(impRaw), full: 25 },
      { axis: "Clarity", v: to25(clarRaw), full: 25 },
    ];
  }

  // Fallback for generic arrays
  if (Array.isArray(breakdown) && breakdown.length > 0) {
    const isOutOf100 = breakdown.some((b) => (b.value ?? b.v ?? 0) > 25);
    return breakdown.map((b) => {
      const raw = b.value ?? b.v ?? 0;
      const v = isOutOf100
        ? Math.min(25, Math.max(0, Math.round((raw / 100) * 25)))
        : Math.min(25, Math.max(0, Math.round(raw)));
      return {
        axis: b.label || b.axis || b.name || "Axis",
        v,
        full: 25,
      };
    });
  }

  return null;
}

function CustomRadarTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  return (
    <div className="rounded-xl bg-[var(--surface)] border border-[var(--border)] shadow-md px-3 py-1.5 text-xs">
      <span className="text-[var(--ink-muted)]">{item.payload?.axis}: </span>
      <span className="font-semibold text-[var(--ink)] tabular">{item.value} / 25</span>
    </div>
  );
}

export function ScoreBreakdown({ breakdown }) {
  const fallbackData = [
    { axis: "Keywords", v: 0, full: 25 },
    { axis: "Formatting", v: 0, full: 25 },
    { axis: "Impact", v: 0, full: 25 },
    { axis: "Clarity", v: 0, full: 25 },
  ];

  const data = parseBreakdown(breakdown) || fallbackData;

  return (
    <Card className="h-full">
      <CardHeader>
        <div>
          <CardTitle className="text-base">Score Breakdown</CardTitle>
          <CardDescription className="mt-1">Each axis scored out of 25</CardDescription>
        </div>
      </CardHeader>
      <div className="h-[230px] -mx-2">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data} outerRadius="70%">
            <PolarGrid stroke="rgba(107, 114, 128, 0.2)" />
            <PolarAngleAxis
              dataKey="axis"
              tick={{ fontSize: 11, fill: "var(--ink-muted)", fontWeight: 500 }}
            />
            <PolarRadiusAxis domain={[0, 25]} tick={false} axisLine={false} />
            <Tooltip content={<CustomRadarTooltip />} />
            <Radar
              name="Score"
              dataKey="v"
              stroke="var(--accent)"
              fill="var(--accent)"
              fillOpacity={0.25}
              strokeWidth={2}
              dot={{ r: 3.5, fill: "var(--accent)", strokeWidth: 1.5, stroke: "var(--surface)" }}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <div className="grid grid-cols-4 gap-2 mt-3 pt-3 border-t border-[var(--border)]">
        {data.map((d) => (
          <div key={d.axis} className="text-center">
            <div className="text-[10px] uppercase tracking-wide text-[var(--ink-muted)]">
              {d.axis}
            </div>
            <div className="font-display tabular text-lg font-semibold mt-0.5">
              {d.v}
              <span className="text-xs text-[var(--ink-muted)] font-normal ml-0.5">
                /25
              </span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
