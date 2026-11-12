import "server-only";
import { Circle, Defs, Ellipse, G, Image, Line, LinearGradient, Page, Path, RadialGradient, Rect, Stop, Svg, Text, View } from "@react-pdf/renderer";
import type { ComponentProps } from "react";
import { flatten, type Kit, type ShapeProps, type Style } from "@/components/quote-render/kit";

/** react-pdf implementation of the template kit. Motion hints are ignored: the PDF prints the final state. */

type PdfStyle = ComponentProps<typeof View>["style"];
const s = (style: Style | Array<Style | false | null | undefined> | undefined) => flatten(style) as PdfStyle;

export const pdfKit: Kit = {
  mode: "pdf",
  // A Page with wrap={false} collapses to its content height in react-pdf: covers keep wrapping on.
  Page: ({ style, children }) => (
    <Page size="A4" style={s(style)}>
      {children}
    </Page>
  ),
  V: ({ style, children, fixed, wrap, breakBefore, minPresenceAhead }) => (
    <View style={s(style)} fixed={fixed} wrap={wrap} break={breakBefore} minPresenceAhead={minPresenceAhead}>
      {children}
    </View>
  ),
  T: ({ style, children, fixed }) => (
    <Text style={s(style)} fixed={fixed}>
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
  Amount: ({ style, text }) => <Text style={s(style)}>{text}</Text>,
};
