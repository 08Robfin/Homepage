/* Keep controls aligned with editable collections before page initialization. */
if (typeof tierData !== 'undefined') {
  const control = document.getElementById('ramSlider');
  if (control) {
    control.max = Math.max(0, tierData.en.length - 1);
    control.value = Math.min(Number(control.value), Number(control.max));
  }
}
