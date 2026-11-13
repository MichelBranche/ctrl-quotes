import type { ReactElement } from "react";
import { fonts, type Kit, type Style } from "../kit";
import { mix, type ChartSlice, type ChartView, type DocModel, type Section } from "../model";

/**
 * The chart blocks, drawn once for the five templates and both renderers: shapes are SVG paths and
 * rects, every word is a kit text (so web and PDF use the same fonts). Each template passes its
 * colours, type and spacing as a theme. Nothing here computes money: the model did.
 */

export type ChartTheme = {
  /** Page background: slice separators and the hole of the ring. */
  page: string;
  ink: string;
  soft: string;
  muted: string;
  rule: string;
  /** Empty part of a bar track. */
  track: string;
  /** Series colours, first is the strongest. */
  palette: string[];
  /** Small labels (legend, axis). */
  label: Style;
  /** Amounts in the legend and next to bars. */
  value: Style;
  /** The big total and the instalment shares. */
  figure: Style;
  /** Caption line ("Una tantum · IVA esclusa"). */
  caption: Style;
  /** Optional surface the chart sits on (Corporate cards, Studio boxes). */
  card?: Style;
  radius: number;
};

/** Eight distinct colours from the accent and the ink of a template, light enough steps to tell apart in print. */
export function chartPalette(accent: string, ink: string, page: string): string[] {
  return [accent, ink, mix(accent, page, 0.45), mix(ink, page, 0.5), mix(accent, ink, 0.45), mix(ink, page, 0.72), mix(accent, page, 0.72), mix(ink, page, 0.3)];
}

type ChartSection = Extract<Section, { kind: "chart" }>;

const TAU = Math.PI * 2;

function point(cx: number, cy: number, radius: number, angle: number): string {
  return `${(cx + radius * Math.cos(angle)).toFixed(3)} ${(cy + radius * Math.sin(angle)).toFixed(3)}`;
}

/** One slice of a pie (inner 0) or ring, clockwise from `from` to `to` (radians, 0 at 3 o'clock). */
export function slicePath(cx: number, cy: number, outer: number, inner: number, from: number, to: number): string {
  if (to - from >= TAU - 1e-6) {
    // A full circle cannot be one arc: two halves.
    const mid = from + Math.PI;
    const ring = inner > 0 ? `M ${point(cx, cy, inner, from)} A ${inner} ${inner} 0 1 0 ${point(cx, cy, inner, mid)} A ${inner} ${inner} 0 1 0 ${point(cx, cy, inner, from)} Z` : "";
    return `M ${point(cx, cy, outer, from)} A ${outer} ${outer} 0 1 1 ${point(cx, cy, outer, mid)} A ${outer} ${outer} 0 1 1 ${point(cx, cy, outer, from)} Z ${ring}`.trim();
  }
  const large = to - from > Math.PI ? 1 : 0;
  if (inner <= 0) return `M ${cx} ${cy} L ${point(cx, cy, outer, from)} A ${outer} ${outer} 0 ${large} 1 ${point(cx, cy, outer, to)} Z`;
  return `M ${point(cx, cy, outer, from)} A ${outer} ${outer} 0 ${large} 1 ${point(cx, cy, outer, to)} L ${point(cx, cy, inner, to)} A ${inner} ${inner} 0 ${large} 0 ${point(cx, cy, inner, from)} Z`;
}

function colorOf(theme: ChartTheme, index: number): string {
  return theme.palette[index % theme.palette.length] ?? theme.ink;
}

function Dot({ k, color, size = 8 }: { k: Kit; color: string; size?: number }) {
  return <k.V style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, flexShrink: 0 }} />;
}

function Caption({ k, theme, text, right }: { k: Kit; theme: ChartTheme; text: string; right?: string }) {
  return (
    <k.V style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
      <k.T style={theme.caption}>{text}</k.T>
      {right ? <k.T style={{ ...theme.caption, color: theme.ink }}>{right}</k.T> : null}
    </k.V>
  );
}

function valueText(slice: ChartSlice, amounts: boolean, percents: boolean): { amount: string | null; percent: string | null } {
  return { amount: amounts ? slice.amount : null, percent: percents ? slice.percent : null };
}

function Costs({ k, theme, chart, width }: { k: Kit; theme: ChartTheme; chart: Extract<ChartView, { type: "costs" }>; width: number }) {
  // In a column the ring shrinks, and in half width or less the legend goes under it.
  const under = width <= 55;
  const size = width >= 90 ? 148 : under ? 124 : 118;
  const center = size / 2;
  const outer = center - 1;
  const inner = chart.variant === "donut" ? outer * 0.64 : 0;
  const start = -Math.PI / 2;
  const arcs = chart.slices.map((slice, index) => {
    const from = start + chart.slices.slice(0, index).reduce((sum, item) => sum + item.share, 0) * TAU;
    const to = chart.slices.length === 1 ? from + TAU : from + slice.share * TAU;
    return { id: slice.id, d: slicePath(center, center, outer, inner, from, to), color: colorOf(theme, index) };
  });
  return (
    <k.V stack={!under} style={{ flexDirection: under ? "column" : "row", alignItems: under ? "stretch" : "center" }}>
      <k.V style={{ width: size, height: size, marginRight: chart.legend && !under ? (width >= 90 ? 26 : 18) : 0, marginBottom: under && chart.legend ? 14 : 0, alignSelf: under ? "center" : chart.legend ? "center" : "flex-start" }}>
        <k.Svg a="donut" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {arcs.map((arc) => (
            <k.Path key={arc.id} d={arc.d} fill={arc.color} stroke={theme.page} strokeWidth={chart.slices.length > 1 ? 1.4 : 0} strokeLinejoin="round" />
          ))}
        </k.Svg>
        {chart.variant === "donut" ? (
          <k.V style={{ position: "absolute", top: 0, left: 0, width: size, height: size, alignItems: "center", justifyContent: "center" }}>
            <k.T style={{ ...theme.label, color: theme.muted, textAlign: "center" }}>Totale</k.T>
            <k.T style={{ ...theme.figure, fontSize: chart.total.length > 13 ? 12 : 14, textAlign: "center", marginTop: 2 }}>{chart.total.replace(/ \/ (mese|anno)$/, "")}</k.T>
            {/\/ (mese|anno)$/.test(chart.total) ? <k.T style={{ ...theme.label, color: theme.muted, textAlign: "center" }}>{chart.total.endsWith("mese") ? "al mese" : "all'anno"}</k.T> : null}
          </k.V>
        ) : null}
      </k.V>
      {chart.legend ? (
        <k.V style={under ? {} : { flexGrow: 1, flexBasis: 0 }}>
          <Caption k={k} theme={theme} text={chart.caption} right={chart.variant === "pie" ? `Totale ${chart.total}` : undefined} />
          {chart.slices.map((slice, index) => {
            const value = valueText(slice, chart.amounts, chart.percents);
            return (
              <k.V key={slice.id} a="row" i={index} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 5.5, borderTopWidth: 0.5, borderTopColor: theme.rule }}>
                <Dot k={k} color={colorOf(theme, index)} />
                <k.T style={{ ...theme.label, color: theme.ink, flexGrow: 1, flexBasis: 0, marginLeft: 8, paddingRight: 8 }}>{slice.label}</k.T>
                {value.amount ? <k.T style={{ ...theme.value, textAlign: "right" }}>{value.amount}</k.T> : null}
                {value.percent ? <k.T style={{ ...theme.value, color: theme.muted, width: 36, textAlign: "right" }}>{value.percent}</k.T> : null}
              </k.V>
            );
          })}
        </k.V>
      ) : (
        <k.V style={under ? { alignItems: "center", marginTop: 10 } : { flexGrow: 1, flexBasis: 0, justifyContent: "center" }}>
          <k.T style={theme.caption}>{chart.caption}</k.T>
        </k.V>
      )}
    </k.V>
  );
}

function Bars({ k, theme, chart, width }: { k: Kit; theme: ChartTheme; chart: Extract<ChartView, { type: "bars" }>; width: number }) {
  const max = Math.max(...chart.slices.map((slice) => slice.share), 0.0001);
  const showValue = chart.amounts || chart.percents;
  const color = (index: number) => (index === 0 ? theme.palette[0] : theme.palette[3]);
  if (width <= 55) {
    // Narrow column: label and value on one line, the bar under them at full width.
    return (
      <k.V>
        <Caption k={k} theme={theme} text={chart.caption} />
        <k.T style={{ ...theme.caption, color: theme.ink, marginTop: -4, marginBottom: 6 }}>{`Totale ${chart.total}`}</k.T>
        {chart.slices.map((slice, index) => {
          const value = valueText(slice, chart.amounts, chart.percents);
          return (
            <k.V key={slice.id} style={{ paddingVertical: 4 }}>
              <k.V style={{ flexDirection: "row", alignItems: "baseline", marginBottom: 3 }}>
                <k.T style={{ ...theme.label, color: theme.ink, flexGrow: 1, flexBasis: 0, paddingRight: 6 }}>{slice.label}</k.T>
                {value.amount ? <k.T style={{ ...theme.value, textAlign: "right" }}>{value.amount}</k.T> : null}
                {value.percent ? <k.T style={{ ...theme.value, color: theme.muted, width: 30, textAlign: "right" }}>{value.percent}</k.T> : null}
              </k.V>
              <k.V style={{ height: 8, borderRadius: theme.radius, backgroundColor: theme.track }}>
                <k.V a="bar" i={index} style={{ width: `${Math.max(1.5, (slice.share / max) * 100)}%`, height: 8, borderRadius: theme.radius, backgroundColor: color(index) }} />
              </k.V>
            </k.V>
          );
        })}
      </k.V>
    );
  }
  return (
    <k.V>
      <Caption k={k} theme={theme} text={chart.caption} right={`Totale ${chart.total}`} />
      {chart.slices.map((slice, index) => {
        const value = valueText(slice, chart.amounts, chart.percents);
        return (
          <k.V key={slice.id} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 4.5 }}>
            <k.T style={{ ...theme.label, color: theme.ink, width: "30%", paddingRight: 10 }}>{slice.label}</k.T>
            <k.V style={{ flexGrow: 1, flexBasis: 0, height: 12, borderRadius: theme.radius, backgroundColor: theme.track }}>
              <k.V a="bar" i={index} style={{ width: `${Math.max(1.5, (slice.share / max) * 100)}%`, height: 12, borderRadius: theme.radius, backgroundColor: color(index) }} />
            </k.V>
            {showValue ? (
              <k.V style={{ width: chart.amounts && chart.percents ? 118 : 74, flexDirection: "row", justifyContent: "flex-end", alignItems: "baseline" }}>
                {value.amount ? <k.T style={{ ...theme.value, textAlign: "right" }}>{value.amount}</k.T> : null}
                {value.percent ? <k.T style={{ ...theme.value, color: theme.muted, width: 34, textAlign: "right" }}>{value.percent}</k.T> : null}
              </k.V>
            ) : null}
          </k.V>
        );
      })}
    </k.V>
  );
}

function Timeline({ k, theme, chart, width }: { k: Kit; theme: ChartTheme; chart: Extract<ChartView, { type: "timeline" }>; width: number }) {
  const labelWidth = width <= 40 ? "44%" : width <= 70 ? "38%" : "34%";
  const pct = (value: number) => `${(value / chart.span) * 100}%`;
  const grid = (
    <k.V style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0, flexDirection: "row" }}>
      {Array.from({ length: chart.span }, (_, index) => (
        <k.V key={index} style={{ flexGrow: 1, flexBasis: 0, borderLeftWidth: 0.5, borderLeftColor: theme.rule, borderRightWidth: index === chart.span - 1 ? 0.5 : 0, borderRightColor: theme.rule }} />
      ))}
    </k.V>
  );
  return (
    <k.V>
      <Caption k={k} theme={theme} text={chart.caption} />
      {chart.notice ? (
        <k.T style={{ ...theme.label, fontSize: 7.8, color: theme.muted, marginBottom: 8, paddingVertical: 5, paddingHorizontal: 8, borderLeftWidth: 2, borderLeftColor: mix(theme.palette[0] ?? theme.ink, theme.page, 0.4), backgroundColor: mix(theme.ink, theme.page, 0.96) }}>{chart.notice}</k.T>
      ) : null}
      {chart.ticks.length ? (
        <k.V style={{ flexDirection: "row", marginBottom: 4 }}>
          <k.V style={{ width: labelWidth }} />
          <k.V style={{ flexGrow: 1, flexBasis: 0, flexDirection: "row" }}>
            {chart.ticks.map((tick) => (
              <k.T key={tick} style={{ ...theme.label, fontSize: 7.4, color: theme.muted, flexGrow: 1, flexBasis: 0, textAlign: "center" }}>
                {tick}
              </k.T>
            ))}
          </k.V>
        </k.V>
      ) : null}
      {chart.phases.map((phase, index) => (
        <k.V key={phase.id} style={{ flexDirection: "row", alignItems: "stretch", borderTopWidth: 0.5, borderTopColor: theme.rule, borderBottomWidth: index === chart.phases.length - 1 ? 0.5 : 0, borderBottomColor: theme.rule }}>
          <k.V style={{ width: labelWidth, paddingVertical: 6, paddingRight: 10, flexDirection: "row" }}>
            <k.T style={{ ...theme.label, color: theme.muted, width: 16 }}>{String(phase.no).padStart(2, "0")}</k.T>
            <k.V style={{ flexGrow: 1, flexBasis: 0 }}>
              <k.T style={{ ...theme.label, color: theme.ink }}>{phase.title || phase.label}</k.T>
              {chart.legend && phase.title && phase.label ? <k.T style={{ ...theme.label, fontSize: 7.6, color: theme.muted, marginTop: 1 }}>{phase.label}</k.T> : null}
            </k.V>
          </k.V>
          <k.V style={{ flexGrow: 1, flexBasis: 0, justifyContent: "center", paddingVertical: 6 }}>
            {grid}
            <k.V style={{ flexDirection: "row" }}>
              <k.V style={{ width: pct(phase.start) }} />
              <k.V a="bar" i={index} style={{ width: pct(phase.end - phase.start), height: 11, borderRadius: theme.radius, backgroundColor: index === chart.phases.length - 1 ? theme.palette[0] : mix(theme.palette[0] ?? theme.ink, theme.page, 0.12 + 0.5 * (1 - index / Math.max(1, chart.phases.length - 1))) }} />
            </k.V>
          </k.V>
        </k.V>
      ))}
    </k.V>
  );
}

function Payments({ k, theme, chart, width }: { k: Kit; theme: ChartTheme; chart: Extract<ChartView, { type: "payments" }>; width: number }) {
  const last = chart.rates.length - 1;
  // Narrow column: the instalments are a list under the bar instead of side by side.
  const list = width <= 55;
  return (
    <k.V>
      <Caption k={k} theme={theme} text={chart.caption} right={list ? undefined : `Totale ${chart.total}`} />
      {list ? <k.T style={{ ...theme.caption, color: theme.ink, marginTop: -4, marginBottom: 8 }}>{`Totale ${chart.total}`}</k.T> : null}
      <k.V style={{ flexDirection: "row", height: 14 }}>
        {chart.rates.map((rate, index) => (
          <k.V
            key={rate.id}
            a="bar"
            i={index}
            style={{
              width: `${rate.share * 100}%`,
              height: 14,
              backgroundColor: colorOf(theme, index),
              borderTopLeftRadius: index === 0 ? theme.radius : 0,
              borderBottomLeftRadius: index === 0 ? theme.radius : 0,
              borderTopRightRadius: index === last ? theme.radius : 0,
              borderBottomRightRadius: index === last ? theme.radius : 0,
              borderRightWidth: index === last ? 0 : 1.5,
              borderRightColor: theme.page,
            }}
          />
        ))}
      </k.V>
      {list && (chart.legend || chart.amounts || chart.percents) ? (
        <k.V style={{ marginTop: 10 }}>
          {chart.rates.map((rate, index) => (
            <k.V key={rate.id} a="rise" i={index} style={{ flexDirection: "row", alignItems: "flex-start", paddingVertical: 6, borderTopWidth: index ? 0.5 : 0, borderTopColor: theme.rule }}>
              <k.V style={{ paddingTop: 3 }}>
                <Dot k={k} color={colorOf(theme, index)} size={7} />
              </k.V>
              <k.V style={{ flexGrow: 1, flexBasis: 0, marginLeft: 7, paddingRight: 6 }}>
                <k.T style={{ ...theme.label, color: theme.muted }}>{`Rata ${index + 1}`}</k.T>
                {chart.legend ? <k.T style={{ ...theme.label, color: theme.soft, marginTop: 1 }}>{rate.label}</k.T> : null}
              </k.V>
              <k.V style={{ alignItems: "flex-end" }}>
                {chart.percents ? <k.T style={{ ...theme.figure, fontSize: 13 }}>{rate.percent}</k.T> : null}
                {chart.amounts ? <k.T style={{ ...theme.value, marginTop: 1 }}>{rate.amount}</k.T> : null}
              </k.V>
            </k.V>
          ))}
        </k.V>
      ) : chart.legend || chart.amounts || chart.percents ? (
        <k.V stack style={{ flexDirection: "row", marginTop: 12 }}>
          {chart.rates.map((rate, index) => (
            <k.V key={rate.id} a="rise" i={index} style={{ flexGrow: 1, flexBasis: 0, paddingLeft: index ? 10 : 0, marginLeft: index ? 10 : 0, borderLeftWidth: index ? 0.5 : 0, borderLeftColor: theme.rule }}>
              <k.V style={{ flexDirection: "row", alignItems: "center" }}>
                <Dot k={k} color={colorOf(theme, index)} size={7} />
                <k.T style={{ ...theme.label, color: theme.muted, marginLeft: 6 }}>{`Rata ${index + 1}`}</k.T>
              </k.V>
              {chart.percents ? <k.T style={{ ...theme.figure, marginTop: 5 }}>{rate.percent}</k.T> : null}
              {chart.amounts ? <k.T style={{ ...theme.value, marginTop: chart.percents ? 1 : 5 }}>{rate.amount}</k.T> : null}
              {chart.legend ? <k.T style={{ ...theme.label, color: theme.soft, marginTop: 3 }}>{rate.label}</k.T> : null}
            </k.V>
          ))}
        </k.V>
      ) : null}
    </k.V>
  );
}

const emptyTitle: Record<string, string> = {
  chartCosts: "Ripartizione dei costi",
  chartBars: "Barre dei costi",
  chartTimeline: "Timeline delle fasi",
  chartPayments: "Piano dei pagamenti",
};

/** Editors only: what the chart needs. The PDF never gets here (the model drops the section). */
function Empty({ k, theme, chart }: { k: Kit; theme: ChartTheme; chart: Extract<ChartView, { type: "empty" }> }) {
  const glyph = (
    <k.Svg width={34} height={34} viewBox="0 0 34 34">
      {chart.chart === "chartCosts" ? (
        <>
          <k.Path d={slicePath(17, 17, 15, 9, -Math.PI / 2, Math.PI * 0.7)} fill={mix(theme.palette[0] ?? theme.ink, theme.page, 0.35)} />
          <k.Path d={slicePath(17, 17, 15, 9, Math.PI * 0.7, Math.PI * 1.5)} fill={mix(theme.ink, theme.page, 0.75)} />
        </>
      ) : chart.chart === "chartPayments" ? (
        <>
          <k.Rect x={2} y={13} width={14} height={8} rx={2} fill={mix(theme.palette[0] ?? theme.ink, theme.page, 0.35)} />
          <k.Rect x={17} y={13} width={9} height={8} fill={mix(theme.ink, theme.page, 0.6)} />
          <k.Rect x={27} y={13} width={5} height={8} rx={2} fill={mix(theme.ink, theme.page, 0.8)} />
        </>
      ) : (
        <>
          <k.Rect x={2} y={6} width={18} height={6} rx={2} fill={mix(theme.palette[0] ?? theme.ink, theme.page, 0.35)} />
          <k.Rect x={chart.chart === "chartTimeline" ? 12 : 2} y={14} width={chart.chart === "chartTimeline" ? 14 : 28} height={6} rx={2} fill={mix(theme.ink, theme.page, 0.6)} />
          <k.Rect x={chart.chart === "chartTimeline" ? 22 : 2} y={22} width={10} height={6} rx={2} fill={mix(theme.ink, theme.page, 0.8)} />
        </>
      )}
    </k.Svg>
  );
  return (
    <k.V style={{ flexDirection: "row", alignItems: "center", paddingVertical: 16, paddingHorizontal: 16, borderWidth: 1, borderStyle: "dashed", borderColor: mix(theme.ink, theme.page, 0.7), borderRadius: 8 }}>
      {glyph}
      <k.V style={{ marginLeft: 14, flexGrow: 1, flexBasis: 0 }}>
        <k.T style={{ ...theme.label, color: theme.ink, fontWeight: 600 }}>{chart.message}</k.T>
        <k.T style={{ ...theme.label, fontSize: 7.8, color: theme.muted, marginTop: 3 }}>{`${emptyTitle[chart.chart] ?? "Grafico"}: si disegna da solo con i dati del preventivo. Finché mancano, nel PDF non viene stampato.`}</k.T>
      </k.V>
    </k.V>
  );
}

/** Body of a chart section, under the template's own heading. */
/** `width`: percent of the content width the chart gets (a column of a row), 100 when full width. */
export function ChartBody({ k, s, theme, width = 100 }: { k: Kit; m: DocModel; s: ChartSection; theme: ChartTheme; width?: number }): ReactElement {
  const chart = s.chart;
  const body =
    chart.type === "costs" ? (
      <Costs k={k} theme={theme} chart={chart} width={width} />
    ) : chart.type === "bars" ? (
      <Bars k={k} theme={theme} chart={chart} width={width} />
    ) : chart.type === "timeline" ? (
      <Timeline k={k} theme={theme} chart={chart} width={width} />
    ) : chart.type === "payments" ? (
      <Payments k={k} theme={theme} chart={chart} width={width} />
    ) : (
      <Empty k={k} theme={theme} chart={chart} />
    );
  return (
    <k.Figure label={s.a11y.summary} table={s.a11y} style={theme.card ?? {}}>
      {body}
    </k.Figure>
  );
}

/** Default type scale of a chart, from a template's sans font. */
export function chartType(font: string, ink: string, muted: string, figures: string = fonts.sans): Pick<ChartTheme, "label" | "value" | "figure" | "caption"> {
  return {
    label: { fontFamily: font, fontSize: 8.8, lineHeight: 1.3, color: ink },
    value: { fontFamily: font, fontSize: 8.8, fontWeight: 600, color: ink },
    figure: { fontFamily: figures, fontSize: 17, fontWeight: figures === fonts.sans ? 600 : 400, color: ink, letterSpacing: -0.3 },
    caption: { fontFamily: font, fontSize: 7.6, fontWeight: 600, letterSpacing: 1.1, textTransform: "uppercase", color: muted },
  };
}
