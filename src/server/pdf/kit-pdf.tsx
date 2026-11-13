import "server-only";
import { Circle, Defs, Ellipse, G, Image, Line, LinearGradient, Page, Path, RadialGradient, Rect, Stop, Svg, Text, View } from "@react-pdf/renderer";
import type { ComponentProps } from "react";
import { flatten, type Kit, type ShapeProps, type Style } from "@/components/quote-render/kit";
import { printPageProp, printTagProp } from "./fit";

/** react-pdf implementation of the template kit. Motion hints are ignored: the PDF prints the final state. */

type PdfStyle = ComponentProps<typeof View>["style"];
/**
 * react-pdf decides page breaks from which keys a node has, not only their values: any `fixed` key,
 * even undefined, skips the break check, so `wrap={false}` did nothing. Only set props are passed.
 */
export function pdfViewProps(props: { fixed?: boolean; wrap?: boolean; breakBefore?: boolean; minPresenceAhead?: number; tag?: string }): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (props.fixed) out.fixed = true;
  if (props.wrap === false) out.wrap = false;
  if (props.breakBefore) out.break = true;
  if (props.minPresenceAhead) out.minPresenceAhead = props.minPresenceAhead;
  if (props.tag) out[printTagProp] = props.tag;
  return out;
}

const s = (style: Style | Array<Style | false | null | undefined> | undefined) => flatten(style) as PdfStyle;

export const pdfKit: Kit = {
  mode: "pdf",
  // A Page with wrap={false} collapses to its content height in react-pdf: covers keep wrapping on.
  Page: ({ style, children, label }) => (
    <Page size="A4" style={s(style)} {...({ [printPageProp]: label } as object)}>
      {children}
    </Page>
  ),
  V: ({ style, children, fixed, wrap, breakBefore, minPresenceAhead, keep, blockId, printId }) => (
    <View style={s(style)} {...pdfViewProps({ fixed, wrap: keep ? false : wrap, breakBefore, minPresenceAhead, tag: printId ?? blockId })}>
      {children}
    </View>
  ),
  T: ({ style, children, fixed }) => (
    <Text style={s(style)} {...(fixed ? { fixed: true } : {})}>
      {children}
    </Text>
  ),
  // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf images have no alt attribute
  Img: ({ src, style }) => <Image src={src} style={s(style)} />,
  Svg: ({ width, height, viewBox, style, children, preserveAspectRatio }) => (
    <Svg width={width} height={height} viewBox={viewBox} style={s(style)} preserveAspectRatio={preserveAspectRatio as never}>
      {children}
    </Svg>
  ),
  Path: (props: ShapeProps) => <Path {...(props as unknown as ComponentProps<typeof Path>)} />,
  Circle: (props: ShapeProps) => <Circle {...(props as unknown as ComponentProps<typeof Circle>)} />,
  Rect: (props: ShapeProps) => <Rect {...(props as unknown as ComponentProps<typeof Rect>)} />,
  Line: (props: ShapeProps) => <Line {...(props as unknown as ComponentProps<typeof Line>)} />,
  Ellipse: (props: ShapeProps) => <Ellipse {...(props as unknown as ComponentProps<typeof Ellipse>)} />,
  G: (props: ShapeProps) => <G {...(props as unknown as ComponentProps<typeof G>)} />,
  Defs: ({ children }) => <Defs>{children}</Defs>,
  LinearGradient: ({ children, ...props }) => <LinearGradient {...props}>{children}</LinearGradient>,
  RadialGradient: ({ children, ...props }) => <RadialGradient {...props}>{children}</RadialGradient>,
  Stop: (props) => <Stop {...props} />,
  PageNo: ({ style, format }) => <Text fixed style={s(style)} render={({ pageNumber, totalPages }) => format(pageNumber, totalPages)} />,
  PageArt: ({ draw }) => <View fixed style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} render={({ pageNumber }) => draw(pageNumber)} />,
  Overflow: ({ style, text }) => <Text fixed style={s(style)} render={({ subPageNumber }) => ((subPageNumber ?? 1) > 1 ? text : "")} />,
  Amount: ({ style, text }) => <Text style={s(style)}>{text}</Text>,
  Figure: ({ style, children }) => (
    <View style={s(style)} wrap={false}>
      {children}
    </View>
  ),
};
