import { useEffect, useRef } from 'react';

type Disposable = { dispose: () => void };

/**
 * Dispose manually-created THREE resources (textures/materials/geometries
 * built inside useMemo) when the owning component unmounts. JSX-declared
 * <geometry>/<material> elements are auto-disposed by R3F; these are not.
 */
export function useDispose(items: Disposable[]): void {
  const ref = useRef(items);
  // Quality and stage changes replace GPU resources while this owner stays mounted.
  // Compare contents because callers can pass a fresh wrapper array each render.
  useEffect(() => {
    for (const previous of ref.current) {
      if (!items.includes(previous)) {
        try { previous?.dispose(); } catch { /* already gone */ }
      }
    }
    ref.current = items;
  });
  useEffect(() => {
    return () => {
      for (const it of ref.current) {
        try { it?.dispose(); } catch { /* already gone */ }
      }
    };
  }, []);
}
