import type { ReactElement } from "react";

export interface AccordionGalleryItem {
  image: string;
  label?: string;
  link?: string;
  alt?: string;
}

export interface AccordionGalleryProps {
  items?: AccordionGalleryItem[];
  defaultIndex?: number;
  accentColor?: string;
  overlayColor?: string;
  textColor?: string;
  grayscale?: boolean;
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
