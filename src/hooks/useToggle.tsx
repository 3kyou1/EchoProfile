/**
 * Toggle Hook
 *
 * Simple boolean state toggle utility for managing open/closed states.
 * Respects CaptureExpandContext — always open during screenshot capture.
 *
 * @example
 * const [isOpen, toggle] = useToggle();
 */

import { useCaptureExpandState } from "@/contexts/CaptureExpandContext";

export const useToggle = (): [boolean, () => void] => {
  const [isOpen, setIsOpen] = useCaptureExpandState(false);
  const toggle = () => setIsOpen((prev) => !prev);
  return [isOpen, toggle];
};
