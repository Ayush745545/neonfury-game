import { useEffect, useRef } from 'react';

type Disposable = { dispose: () => void };

/**
 * Dispose manually-created THREE resources (textures/materials/geometries
 * built inside useMemo) when the owning component unmounts. JSX-declared
 * <geometry>/<material> elements are auto-disposed by R3F; these are not.
 */
export function useDispose(items: Disposable[]): void {
  const ref = useRef(items);
  useEffect(() => {
    const list = ref.current;
    return () => {
      for (const it of list) {
        try { it?.dispose(); } catch { /* already gone */ }
      }
    };
  }, []);
}
