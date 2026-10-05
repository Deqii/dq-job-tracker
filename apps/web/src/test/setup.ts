import '@testing-library/jest-dom/vitest';

// jsdom does not implement scrollIntoView, which the application form calls to
// bring the company field into view on a validation error or a form reset.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}