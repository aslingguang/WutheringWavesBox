const EDIT_FIELD_SELECTOR = [
  'input:not([type="button"]):not([type="checkbox"]):not([type="color"]):not([type="file"]):not([type="radio"]):not([type="range"]):not([type="reset"]):not([type="submit"])',
  'textarea',
].join(',');

const isEditField = (value: Element | null): value is HTMLInputElement | HTMLTextAreaElement =>
  value instanceof HTMLInputElement || value instanceof HTMLTextAreaElement
    ? value.matches(EDIT_FIELD_SELECTOR)
    : false;

/** Keeps edit-field interaction bound to the control's painted rectangle. */
export function installPreciseEditFieldInteractions(): void {
  let hoveredField: HTMLInputElement | HTMLTextAreaElement | null = null;

  document.addEventListener(
    'pointermove',
    (event) => {
      const hit = document.elementFromPoint(event.clientX, event.clientY);
      const candidate = hit instanceof Element ? hit.closest(EDIT_FIELD_SELECTOR) : null;
      const nextField = isEditField(candidate) ? candidate : null;

      if (nextField === hoveredField) return;
      hoveredField?.removeAttribute('data-precise-hover');
      hoveredField = nextField;
      hoveredField?.setAttribute('data-precise-hover', 'true');
    },
    true,
  );

  document.addEventListener(
    'pointerleave',
    () => {
      hoveredField?.removeAttribute('data-precise-hover');
      hoveredField = null;
    },
    true,
  );

  document.addEventListener(
    'click',
    (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const label = target.closest('label');
      const control = label instanceof HTMLLabelElement ? label.control : null;
      if (!isEditField(control) || target === control || control.contains(target)) return;

      // Native labels forward blank-row clicks to their control. Editing fields
      // should only focus when their own visible rectangle was clicked.
      event.preventDefault();
    },
    true,
  );
}
