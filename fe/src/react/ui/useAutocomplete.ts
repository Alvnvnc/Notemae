/* Hook autocomplete: membungkus helper legacy attachAutocomplete (debounce +
   pembatalan + navigasi keyboard combobox) ke input/list yang dirender React.
   Dipasang sekali; callback dibaca lewat ref supaya tidak perlu re-attach saat
   induk re-render. Mengembalikan ref berisi { close } untuk dipanggil manual. */
import { useEffect, useRef, type RefObject } from "react";
import { attachAutocomplete } from "../../legacy/autocomplete.js";
import type { Fragrance } from "../../lib/api-types.ts";

type Ac = { close: () => void; destroy: () => void };

export function useAutocomplete(opts: {
  inputRef: RefObject<HTMLInputElement | null>;
  listRef: RefObject<HTMLUListElement | null>;
  onPick: (f: Fragrance) => void;
  onSubmit?: (q: string) => void;
  itemClass?: string;
}): RefObject<Ac | null> {
  const acRef = useRef<Ac | null>(null);
  const cb = useRef(opts);
  cb.current = opts;

  useEffect(() => {
    const input = opts.inputRef.current;
    const list = opts.listRef.current;
    if (!input || !list) return;
    acRef.current = attachAutocomplete({
      input, list, itemClass: opts.itemClass,
      onPick: (f: Fragrance) => cb.current.onPick(f),
      onSubmit: (q: string) => cb.current.onSubmit?.(q),
    });
    return () => acRef.current?.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return acRef;
}
