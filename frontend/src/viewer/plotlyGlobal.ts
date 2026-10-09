/** For CDN exports (`freeze(offline=False)`): use the page's global Plotly. */
const Plotly = (window as unknown as { Plotly: unknown }).Plotly;
export default Plotly;
