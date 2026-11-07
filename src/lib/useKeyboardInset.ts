import { useEffect, useState } from 'react';
import { Keyboard, Platform, type KeyboardEvent } from 'react-native';

/** Ignore browser chrome and only treat a real keyboard as overlap. */
export function keyboardOverlap(layoutHeight: number, visibleHeight: number, offsetTop = 0): number {
  const overlap = layoutHeight - visibleHeight - offsetTop;
  if (!Number.isFinite(overlap) || overlap < 80) return 0;
  return Math.round(overlap);
}

function readWebKeyboardInset(): number {
  if (typeof window === 'undefined') return 0;
  const viewport = window.visualViewport;
  if (!viewport) return 0;
  return keyboardOverlap(window.innerHeight, viewport.height, viewport.offsetTop);
}

/** Pixels the software keyboard overlaps the screen. 0 when the keyboard is hidden. */
export function useKeyboardInset(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (Platform.OS === 'web') {
      const update = () => setHeight(readWebKeyboardInset());
      update();
      const viewport = window.visualViewport;
      viewport?.addEventListener('resize', update);
      viewport?.addEventListener('scroll', update);
      window.addEventListener('resize', update);
      return () => {
        viewport?.removeEventListener('resize', update);
        viewport?.removeEventListener('scroll', update);
        window.removeEventListener('resize', update);
      };
    }

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = (event: KeyboardEvent) => setHeight(event.endCoordinates.height);
    const onHide = () => setHeight(0);
    const showSub = Keyboard.addListener(showEvent, onShow);
    const hideSub = Keyboard.addListener(hideEvent, onHide);
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return height;
}
