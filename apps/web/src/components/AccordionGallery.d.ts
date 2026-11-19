import type { ReactElement } from "react";

export interface AccordionGalleryItem {
  image: string;
  label?: string;
  link?: string;
  alt?: string;
  /** Step number shown in a circle at the centre of the panel. */
  step?: number;
  /** One word under the step number. */
  word?: string;
  /** Longer text shown only on the open panel; falls back to label. */
  detail?: string;
}

export interface AccordionGalleryProps {
  items?: AccordionGalleryItem[];
  defaultIndex?: number;
  accentColor?: string;
  overlayColor?: string;
  textColor?: string;
  grayscale?: boolean;
  /** Blur the artwork of closed panels until they open. */
  blurInactive?: boolean;
  showLabels?: boolean;
  duration?: number;
  ease?: string;
  parallax?: number;
  tilt?: number;
  stagger?: number;
  trigger?: "hover" | "click";
  height?: number;
  gap?: number;
  radius?: number;
  expandRatio?: number;
  orientation?: "horizontal" | "vertical";
  className?: string;
}

declare function AccordionGallery(props: AccordionGalleryProps): ReactElement;
export default AccordionGallery;
