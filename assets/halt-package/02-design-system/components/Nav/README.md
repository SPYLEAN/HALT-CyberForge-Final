# Nav

The product rail lists the six HALT systems in pipeline order (HALT-R1, ThreadGraph, EchoLab, SafeCut, ProofSeal, Action Gate), so the order of the rail is the order of the argument: see it, simulate it, cut it, prove it, approve it.

Provide `items` (`id`, `label`, optional `index`, `href`), `active` (an `id`) and optionally `onSelect`. The rail is 232px wide (`app-rail-width`), uses `surface`, and marks the current item with `aria-current="page"` and a 2px Bone bar, not a colour. Put the persistent SIMULATED chip in `footer` whenever the data is demonstration data.

Do not add icons per item, unread badges or Ember dots: Ember in navigation would read as a threat. Below `bp-md` the rail collapses to index numbers only; below `bp-sm` it becomes a bottom bar.
