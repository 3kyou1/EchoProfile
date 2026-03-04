/* eslint-disable react-refresh/only-export-components */
/**
 * CaptureExpandContext
 *
 * Forces all collapsible content to expand during screenshot capture.
 *
 * Usage:
 *   // Provider — wrap capture renderer once
 *   <CaptureExpandProvider value={{ forceExpanded: true }}>
 *
 *   // Consumer — replace useState(false) in any collapsible component
 *   const [isExpanded, setExpanded] = useCaptureExpandState(false);
 */

import { createContext, useContext, useState } from "react";

interface CaptureExpandContextValue {
  forceExpanded: boolean;
}

const CaptureExpandContext = createContext<CaptureExpandContextValue>({
  forceExpanded: false,
});

export const CaptureExpandProvider = CaptureExpandContext.Provider;

export function useForceExpanded(): boolean {
  return useContext(CaptureExpandContext).forceExpanded;
}

/**
 * Drop-in replacement for useState<boolean> that respects capture mode.
 *
 * Returns [effectiveState, setter] where effectiveState is forced to
 * true when inside a CaptureExpandProvider with forceExpanded=true.
 *
 * @param initialState - default collapsed/expanded value (same as useState)
 */
export function useCaptureExpandState(
  initialState: boolean | (() => boolean),
): [boolean, React.Dispatch<React.SetStateAction<boolean>>] {
  const forceExpanded = useContext(CaptureExpandContext).forceExpanded;
  const [local, setLocal] = useState(initialState);
  return [forceExpanded || local, setLocal];
}
