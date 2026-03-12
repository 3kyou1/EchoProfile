/**
 * Toggle Hook
 *
 * Simple boolean state toggle utility for managing open/closed states.
 * State is shared via expand registry for WYSIWYG capture support.
 *
 * @example
 * const [isOpen, toggle] = useToggle("section-name");
 */

import { useCallback } from "react";
import { useCaptureExpandState } from "@/contexts/CaptureExpandContext";

export function useToggle(
  suffix: string,
  initialState = false,
): [boolean, () => void, (value: boolean | ((prev: boolean) => boolean)) => void] {
  const [isOpen, setIsOpen] = useCaptureExpandState(suffix, initialState);
  const toggle = useCallback(() => setIsOpen((prev) => !prev), [setIsOpen]);
  return [isOpen, toggle, setIsOpen];
}
