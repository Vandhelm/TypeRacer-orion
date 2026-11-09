/** Round "i" button whose tooltip explains a setting (styles: components/info-tip.css). */
export function InfoTip({ text }: { text: string }) {
  return (
    <button className="info-tip" type="button" data-tip={text} aria-label={text}>
      i
    </button>
  );
}
