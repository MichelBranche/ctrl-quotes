export const motionDurations = {
  hover: 150,
  page: 200,
  popover: 150,
  tab: 180,
  dialog: 180,
  drawer: 240,
  metric: 450,
  chart: 400,
} as const;

export const motionEaseOut = [0.16, 1, 0.3, 1] as const;

export function pageEnter(reducedMotion: boolean): {
  initial: { opacity: number; y?: number };
  animate: { opacity: number; y: number };
  transition: { duration: number; ease: readonly [number, number, number, number] };
} {
  if (reducedMotion) {
    return {
      initial: { opacity: 1, y: 0 },
      animate: { opacity: 1, y: 0 },
      transition: { duration: 0, ease: motionEaseOut },
    };
  }
  return {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: motionDurations.page / 1000, ease: motionEaseOut },
  };
}
